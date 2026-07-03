import type { KVNamespace } from '@cloudflare/workers-types';
import type { Session } from '../../domain/auth/types';
import type { IdTokenClaims } from '../../infrastructure/auth/verifyIdToken';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService } from './IAuthService';

export function buildMicrosoftUid(
  claims: Pick<IdTokenClaims, 'tid' | 'oid'>
): string {
  return `${claims.tid}:${claims.oid}`;
}

export function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
}

export function createAuthService(
  userRepository: IUserRepository,
  kv: KVNamespace
): IAuthService {
  return {
    async upsertUser(claims: IdTokenClaims) {
      const email = claims.preferred_username ?? claims.email ?? '';
      const displayName = claims.name ?? email;
      const uid = buildMicrosoftUid(claims);

      const existingUserId = await userRepository.findUserIdByMicrosoftAccount(
        claims.oid,
        claims.tid
      );

      if (existingUserId) {
        return userRepository.updateUser({
          userId: existingUserId,
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
          uid,
        });
      }

      return userRepository.createUserWithMicrosoftLink({
        oid: claims.oid,
        tid: claims.tid,
        sub: claims.sub,
        email,
        displayName,
        uid,
        studentNumber: `ms:${uid}`,
      });
    },

    async saveSession(sessionId: string, session: Session) {
      await kv.put(`session:${sessionId}`, JSON.stringify(session), {
        expirationTtl: getSessionTtlSeconds(session.expires_at),
      });
    },
  };
}
