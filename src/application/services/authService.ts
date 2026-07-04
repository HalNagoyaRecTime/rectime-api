import type { KVNamespace } from '@cloudflare/workers-types';
import type { Session } from '../../domain/auth/types';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';

export function buildMicrosoftUid(claims: {
  tid: string;
  oid: string;
}): string {
  return `${claims.tid}:${claims.oid}`;
}

export function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  if (!Number.isFinite(ttl) || ttl < 60) {
    throw new Error('SESSION_ALREADY_EXPIRED');
  }
  return ttl;
}

export function createAuthService(
  userRepository: IUserRepository,
  kv: KVNamespace
): IAuthService {
  return {
    async upsertUser(claims: MicrosoftClaims) {
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

      try {
        return await userRepository.createUserWithMicrosoftLink({
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
          uid,
          studentNumber: `ms:${uid}`,
        });
      } catch {
        // 同時初回ログインによる UNIQUE 制約違反: 先勝ちしたレコードで update に切り替える
        const racedUserId = await userRepository.findUserIdByMicrosoftAccount(
          claims.oid,
          claims.tid
        );
        if (!racedUserId) throw new Error('CREATE_USER_FAILED');
        return userRepository.updateUser({
          userId: racedUserId,
          oid: claims.oid,
          tid: claims.tid,
          sub: claims.sub,
          email,
          displayName,
          uid,
        });
      }
    },

    async saveSession(sessionId: string, session: Session) {
      const ttl = getSessionTtlSeconds(session.expires_at);
      await kv.put(`session:${sessionId}`, JSON.stringify(session), {
        expirationTtl: ttl,
      });
    },
  };
}
