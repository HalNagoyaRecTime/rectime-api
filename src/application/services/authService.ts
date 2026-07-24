import type { KVNamespace } from '@cloudflare/workers-types';
import type { Session } from '../../domain/auth/types';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthService, MicrosoftClaims } from './IAuthService';

export function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error('SESSION_ALREADY_EXPIRED');
  }
  if (ttl < 60) {
    // Cloudflare KV は expirationTtl >= 60 を要求する。SESSION_EXPIRES_SEC は 120 以上に設定すること。
    throw new Error('SESSION_TTL_TOO_SHORT');
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

      const existingUserId = await userRepository.findUserIdByMicrosoftAccount(
        claims.oid,
        claims.tid
      );

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

    async saveSession(sessionId: string, session: Session) {
      const ttl = getSessionTtlSeconds(session.expires_at);
      await kv.put(`session:${sessionId}`, JSON.stringify(session), {
        expirationTtl: ttl,
      });
    },

    async getSession(sessionId: string) {
      const raw = await kv.get(`session:${sessionId}`);
      if (!raw) return null;

      const session = JSON.parse(raw) as Session;
      if (new Date(session.expires_at) < new Date()) return null;

      return session;
    },
  };
}
