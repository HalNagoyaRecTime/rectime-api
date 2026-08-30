import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';

function extractStudentIdNumber(
  email: string,
  studentEmailDomain: string
): string | null {
  const [localPart, domain] = email.split('@');
  // emailが空文字の場合(claims.preferred_username/emailが
  // どちらも無い場合)、localPartも空文字になるためガードする。
  // (@が無い場合のガードではない)
  if (!localPart || !domain) return null;

  //ドメインが学生用のものと一致しない場合、対象外とする
  if (domain !== studentEmailDomain) return null;

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
  studentEmailDomain: string
): IAuthService {
  if (!studentEmailDomain) {
    throw new Error('STUDENT_EMAIL_DOMAIN is not configured');
  }

  return {
    async upsertUser(claims: MicrosoftClaims) {
      const email = claims.preferred_username ?? claims.email ?? '';
      const displayName = claims.name ?? email;

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

        const updated = await userRepository.updateUser({
          userId: existingUserId,
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
        });
        if (!updated) throw new Error('USER_NOT_FOUND');
        return updated;
      }

      const studentIdNumber = extractStudentIdNumber(email, studentEmailDomain);
      if (studentIdNumber) {
        const student =
          await studentRepository.findByStudentNum(studentIdNumber);
        if (student) {
          const studentDeletionStatus = await userRepository.getDeletionStatus(
            String(student.user_id)
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
              await userRepository.linkMicrosoftAccount({
                userId: String(student.user_id),
                oid: claims.oid,
                tid: claims.tid,
              });
              return {
                id: String(student.user_id),
                oid: claims.oid,
                tid: claims.tid,
                sub: claims.sub,
                email,
                display_name: student.user_name,
              };
            } catch (err) {
              if (!(err instanceof Error)) throw err;

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
                  display_name: student.user_name,
                };
              }
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
  };
}
