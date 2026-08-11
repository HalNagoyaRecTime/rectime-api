import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { students } from '../../infrastructure/database/schema';

function extractStudentIdNumber(email: string): string | null {
  const localPart = email.split('@')[0];
  if (!localPart) return null;

  const match = localPart.match(/(\d+)$/);
  return match ? match[1] : null;
}

export function createAuthService(
  userRepository: IUserRepository,
  studentRepository: IStudentRepository
): IAuthService {
  return {
    async upsertUser(claims: MicrosoftClaims) {
      const email = claims.preferred_username ?? claims.email ?? '';
      const displayName = claims.name ?? email;

      const existingUserId = await userRepository.findUserIdByMicrosoftAccount(
        claims.oid,
        claims.tid
      );

      if (!existingUserId) {
        const studentIdNumber = extractStudentIdNumber(email);
        if (studentIdNumber) {
          const student =
            await studentRepository.findByStudentNum(studentIdNumber);
          if (student) {
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
          }
        }
      }

      if (existingUserId) {
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
