import type { KVNamespace } from '@cloudflare/workers-types';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';

function getEmailDomain(email: string): string | null {
  const parts = email.trim().split('@');
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    parts.some(part => /\s/u.test(part))
  ) {
    return null;
  }
  return parts[1].toLowerCase();
}

function extractStudentIdNumber(
  email: string,
  studentEmailDomain: string
): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;
  if (!localPart || domain !== studentEmailDomain) return null;

  //"nhs"+ 数値 の形式に当てはまらない場合、学籍番号とみなさない
  // 抽出した数字列は、students.student_id_number(text型)の値と
  // 完全一致で照合される前提のため、先頭ゼロの有無を含め、
  // メールアドレスとDBの登録値の表記が揃っている必要がある
  // (例: メールが nhs00123 なら、DB側も "00123" である必要がある)。
  const match = localPart.match(/^nhs(\d+)$/);
  return match ? match[1] : null;
}

export function createAuthService(
  userRepository: IUserRepository,
  studentRepository: IStudentRepository,
  teacherRepository: ITeacherRepository,
  studentEmailDomain: string,
  authKv: KVNamespace,
  firebaseTokenRepository: IFirebaseTokenRepository
): IAuthService {
  if (!studentEmailDomain) {
    throw new Error('STUDENT_EMAIL_DOMAIN is not configured');
  }
  const normalizedStudentEmailDomain = studentEmailDomain.trim().toLowerCase();

  return {
    async upsertUser(claims: MicrosoftClaims) {
      const email = claims.preferred_username ?? claims.email ?? '';
      const claimName =
        typeof claims.name === 'string' ? claims.name : undefined;
      const displayName = claimName ?? email;

      const existingUserId = await userRepository.findUserIdByMicrosoftAccount(
        claims.oid,
        claims.tid
      );

      if (existingUserId) {
        const deletionStatus =
          await userRepository.getDeletionStatus(existingUserId);
        if (deletionStatus && deletionStatus !== 'active') {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }

        // updateUser自体もWHERE句にdeletion_status = 'active'を含めており、
        // ここまでのgetDeletionStatus確認とこのupdateの間にmarkAsDeletedが
        // 割り込んだ場合(TOCTOU)は0件更新になりnullが返る。その場合は
        // updated===null→USER_NOT_FOUNDと即断せず、最新状態を見て
        // ACCOUNT_DELETION_PENDINGを優先させる。
        const updated = await userRepository.updateUser({
          userId: existingUserId,
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
        });
        if (!updated) {
          const latestStatus =
            await userRepository.getDeletionStatus(existingUserId);
          if (latestStatus && latestStatus !== 'active') {
            throw new Error('ACCOUNT_DELETION_PENDING');
          }
          throw new Error('USER_NOT_FOUND');
        }
        return updated;
      }

      const studentIdNumber = extractStudentIdNumber(email, studentEmailDomain);
      if (studentIdNumber) {
        const student =
          await studentRepository.findByStudentNum(studentIdNumber);
        if (student) {
          const studentDeletionStatus = await userRepository.getDeletionStatus(
            String(student.userId)
          );
          if (studentDeletionStatus === 'deletion_pending') {
            throw new Error('ACCOUNT_DELETION_PENDING');
          }
          // deletionStatusが'deleted'の場合はここでlinkMicrosoftAccountを
          // 呼ばない。この学籍番号の古いuser_idへ紐付けてしまうと、
          // 削除済みユーザーへMicrosoftアカウントが再度紐付き、ログイン用
          // Tokenが発行されてしまう(#265で確定した「本人削除済みデータを
          // 復元しない」に反する)。studentが見つからなかった場合と同じく
          // 素通りさせ、後続のcreateUserWithMicrosoftLinkで新規アカウント
          // として登録する。
          if (studentDeletionStatus !== 'deleted') {
            try {
              // linkMicrosoftAccount自体もINSERT ... WHERE deletion_status
              // = 'active'を条件に含めており、直前のgetDeletionStatus確認と
              // このINSERTの間にmarkAsDeletedが割り込んだ場合(TOCTOU)は
              // ACCOUNT_DELETION_PENDINGがthrowされる。
              await userRepository.linkMicrosoftAccount({
                userId: String(student.userId),
                oid: claims.oid,
                tid: claims.tid,
              });
              return {
                id: String(student.userId),
                oid: claims.oid,
                tid: claims.tid,
                sub: claims.sub,
                email,
                display_name: student.userName,
              };
            } catch (err) {
              if (!(err instanceof Error)) throw err;

              if (err.message === 'ACCOUNT_DELETION_PENDING') {
                throw err;
              }

              //user_idが既に別のMicrosoftアカウントと結びついている場合
              if (
                err.message.includes('UNIQUE constraint failed') &&
                err.message.includes('microsoft_account_links.user_id')
              ) {
                throw new Error('STUDENT_ALREADY_LINKED');
              }

              // 同時初回ログインによる UNIQUE 制約違反: 先勝ちしたレコードを正とする
              // この場合、既に存在するusers.user_idを活用し、microsoft_account_linksに挿入完了した結果
              // に対しての(oid,tid)のUNIQUE制約違反になるので、usersは更新しない
              if (
                err.message.includes('UNIQUE constraint failed') &&
                err.message.includes('microsoft_account_links.oid')
              ) {
                const racedUserId =
                  await userRepository.findUserIdByMicrosoftAccount(
                    claims.oid,
                    claims.tid
                  );
                if (!racedUserId) throw new Error('LINK_STUDENT_FAILED');
                return {
                  id: racedUserId,
                  oid: claims.oid,
                  tid: claims.tid,
                  sub: claims.sub,
                  email,
                  display_name: student.userName,
                };
              }
            }
          }
        }
      }

      // 教員は学生のような学籍番号を持たず、現行の事前登録情報で
      // Microsoft側と照合できるのは氏名だけである。学生用メールの
      // 利用者を同名の教員へ誤って紐付けないよう、形式が不正なものも含め
      // 学生用ドメインは教員照合の対象外にする。また、emailへフォール
      // バックしたdisplayNameではなく、ID Tokenのnameが実際に存在する
      // 場合だけ照合する。
      const emailDomain = getEmailDomain(email);
      const teacherDisplayName = claimName?.trim() ?? '';
      if (
        emailDomain &&
        emailDomain !== normalizedStudentEmailDomain &&
        teacherDisplayName
      ) {
        const candidates =
          await teacherRepository.findMicrosoftLinkCandidatesByDisplayName(
            teacherDisplayName
          );

        // users.user_nameにはUNIQUE制約がない。同姓同名が複数いる場合に
        // 先頭の1人を選ぶと別人の担当クラス・権限を奪うため、書き込みを
        // 一切せず明示的に拒否する。
        if (candidates.length > 1) {
          throw new Error('TEACHER_LINK_AMBIGUOUS');
        }

        const teacher = candidates[0];
        if (teacher) {
          const teacherDeletionStatus = await userRepository.getDeletionStatus(
            String(teacher.userId)
          );
          if (teacherDeletionStatus === 'deletion_pending') {
            throw new Error('ACCOUNT_DELETION_PENDING');
          }

          // 学生の既存処理と同じく、削除済みユーザーは復元しない。
          // 状態確認時点でdeletedなら古いuser_idへは結ばず、後続の新規
          // 作成へ進める。状態確認後に削除された場合は、linkMicrosoftAccount
          // 側の条件付きINSERTがACCOUNT_DELETION_PENDINGとして拒否する。
          if (teacherDeletionStatus !== 'deleted') {
            // 無効化された教員を「候補なし」として新規ユーザー化すると
            // 管理者による無効化を迂回できるため、既存IDのまま拒否する。
            if (!teacher.isLiveActive) {
              throw new Error('USER_DEACTIVATED');
            }
            try {
              await userRepository.linkMicrosoftAccount({
                userId: String(teacher.userId),
                oid: claims.oid,
                tid: claims.tid,
                requireLiveActive: true,
              });
              return {
                id: String(teacher.userId),
                oid: claims.oid,
                tid: claims.tid,
                sub: claims.sub,
                email,
                display_name: teacher.userName,
              };
            } catch (err) {
              if (!(err instanceof Error)) throw err;

              if (err.message === 'ACCOUNT_DELETION_PENDING') {
                throw err;
              }

              if (err.message === 'USER_DEACTIVATED') {
                throw err;
              }

              if (
                err.message.includes('UNIQUE constraint failed') &&
                err.message.includes('microsoft_account_links')
              ) {
                // SQLiteが複数のUNIQUE制約のどれを先に報告するかには依存
                // しない。同一Microsoftアカウントによる同時初回ログイン
                // なら、先に作られたリンクがこの教員を指している場合だけ
                // 冪等な成功として扱う。
                const racedUserId =
                  await userRepository.findUserIdByMicrosoftAccount(
                    claims.oid,
                    claims.tid
                  );
                if (racedUserId === String(teacher.userId)) {
                  return {
                    id: racedUserId,
                    oid: claims.oid,
                    tid: claims.tid,
                    sub: claims.sub,
                    email,
                    display_name: teacher.userName,
                  };
                }

                // 現在のMicrosoftアカウントが別user_idへ結ばれた競合、
                // または対象教員が別Microsoftアカウントと既に連携済みの
                // いずれも、この教員への新規リンクは安全に作れない。
                if (
                  racedUserId ||
                  err.message.includes('microsoft_account_links.user_id')
                ) {
                  throw new Error('TEACHER_ALREADY_LINKED');
                }
              }

              // DB障害などを「候補なし」とみなして新しいusers行を作ると、
              // 元の教員user_idと分裂するため、想定外エラーは必ず伝播する。
              throw err;
            }
          }
        }
      }

      try {
        return await userRepository.createUserWithMicrosoftLink({
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
        });
      } catch (err) {
        if (
          !(
            err instanceof Error &&
            err.message.includes('UNIQUE constraint failed') &&
            err.message.includes('microsoft_account_links')
          )
        )
          throw err;
        // 同時初回ログインによる UNIQUE 制約違反: 先勝ちしたレコードで update に切り替える
        const racedUserId = await userRepository.findUserIdByMicrosoftAccount(
          claims.oid,
          claims.tid
        );
        if (!racedUserId) throw new Error('CREATE_USER_FAILED');
        const raced = await userRepository.updateUser({
          userId: racedUserId,
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
        });
        if (!raced) throw new Error('CREATE_USER_FAILED');
        return raced;
      }
    },

    async startAccountDeletion(userId: string) {
      // 1. DB上の状態遷移(deletion_status: deleted)とMicrosoftアカウント
      //    リンクの解除。既に呼ばれていても冪等に成功する。この時点では
      //    関連データの削除・匿名化(後片付け)はまだ完了していない
      //    (purged_atはNULLのまま)。後片付けはこの後accountDeletionService.
      //    deleteRelatedDataが行う(詳細はIUserRepository.markAsPurgedの
      //    コメント参照)。
      await userRepository.markAsDeleted(userId);

      // 2. 発行済みの全Refresh Sessionを失効させる。mobile_refresh_by_user
      //    は1ユーザー1セッション設計(新規ログインのたびに上書きされる)
      //    のため、これを削除すれば現在・過去を含め有効なセッションが
      //    存在しない状態になる。
      const refreshTokenId = await authKv.get(
        `mobile_refresh_by_user:${userId}`
      );
      if (refreshTokenId) {
        await authKv.delete(`mobile_refresh:${refreshTokenId}`);
      }
      await authKv.delete(`mobile_refresh_by_user:${userId}`);

      // 3. Firebase Token登録をPush通知対象から除外する。
      await firebaseTokenRepository.deactivateByUserId(Number(userId));
    },
  };
}
