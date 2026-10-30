import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import type { IRefreshSessionRepository } from '../../domain/interfaces/repositories/IRefreshSessionRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import {
  extractStudentIdNumber,
  normalizeMicrosoftEmail,
} from '../../domain/auth/email';

export function createAuthService(
  userRepository: IUserRepository,
  studentRepository: IStudentRepository,
  teacherRepository: ITeacherRepository,
  studentEmailDomain: string,
  refreshSessionRepository: Pick<IRefreshSessionRepository, 'deleteByUserId'>,
  firebaseTokenRepository: IFirebaseTokenRepository
): IAuthService {
  if (!studentEmailDomain) {
    throw new Error('STUDENT_EMAIL_DOMAIN is not configured');
  }
  const normalizedStudentEmailDomain = studentEmailDomain.trim().toLowerCase();

  return {
    async upsertUser(claims: MicrosoftClaims) {
      const preferredUsername =
        typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : '';
      const emailClaim = typeof claims.email === 'string' ? claims.email : '';
      const email = preferredUsername.trim()
        ? preferredUsername
        : emailClaim.trim()
          ? emailClaim
          : '';
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

      const normalizedEmail = normalizeMicrosoftEmail(email);
      const normalizedTeacherEmail = preferredUsername.trim()
        ? normalizeMicrosoftEmail(preferredUsername)
        : null;
      const studentIdNumber = normalizedEmail
        ? extractStudentIdNumber(normalizedEmail, normalizedStudentEmailDomain)
        : null;
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

      // 教員は事前登録されたMicrosoftサインイン用メールアドレスで照合する。
      // teachers.emailは保存時にtrim + lowercaseで正規化されているため、
      // ID Token側も同じ形に揃える。氏名は表示用途に限り、職員番号などが
      // 含まれていても本人確認には使わない。
      // preferred_usernameはMicrosoftのサインイン用アドレスであり、
      // 連絡先用途のemail claimにはフォールバックしない。また、nhs+数字の
      // 学生形式は、DBに該当学生がまだいなくても教員として扱わない。
      if (normalizedTeacherEmail && !studentIdNumber) {
        const teacher =
          await teacherRepository.findMicrosoftLinkCandidateByEmail(
            normalizedTeacherEmail
          );

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
                requiredTeacherEmail: normalizedTeacherEmail,
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

              if (err.message === 'TEACHER_LINK_CHANGED') {
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
        if (!(
          err instanceof Error &&
          err.message.includes('UNIQUE constraint failed') &&
          err.message.includes('microsoft_account_links')
        ))
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

      // 2. 発行済みの全Refresh Sessionを失効させる。
      await refreshSessionRepository.deleteByUserId(userId);

      // 3. Push対象から即時除外するためTokenを物理削除する。v2 Delivery履歴は
      //    FKのON DELETE SET NULLでToken参照だけを外して保持する。
      await firebaseTokenRepository.deleteByUserId(Number(userId));
    },
  };
}
