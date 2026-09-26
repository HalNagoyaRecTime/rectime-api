import type { KVNamespace } from '@cloudflare/workers-types';
import type { MobileRefreshEntry } from '../../domain/auth/types';
import type { IRefreshSessionRepository } from '../../domain/interfaces/repositories/IRefreshSessionRepository';

const REFRESH_SESSION_KEY = 'mobile_refresh:';
const USER_REFRESH_SESSION_KEY = 'mobile_refresh_by_user:';

function readOwner(refreshSession: string): string | null {
  try {
    const entry = JSON.parse(refreshSession) as Partial<MobileRefreshEntry>;
    return typeof entry.user_id === 'string' ? entry.user_id : null;
  } catch {
    return null;
  }
}

export function createKvRefreshSessionRepository(
  authKv: KVNamespace
): IRefreshSessionRepository {
  return {
    async cleanupForUser(userId, refreshTokenId) {
      const userKey = USER_REFRESH_SESSION_KEY + userId;
      let cleanupFailed = false;
      let targetId = refreshTokenId;

      if (targetId === undefined) {
        try {
          targetId = (await authKv.get(userKey)) ?? undefined;
        } catch {
          cleanupFailed = true;
        }
      }

      if (targetId !== undefined) {
        const refreshKey = REFRESH_SESSION_KEY + targetId;
        let refreshSessionCleaned = false;
        try {
          const refreshSession = await authKv.get(refreshKey);
          if (refreshSession === null) {
            refreshSessionCleaned = true;
          } else {
            const owner = readOwner(refreshSession);
            if (owner === null) {
              cleanupFailed = true;
            } else if (owner === userId) {
              await authKv.delete(refreshKey);
              refreshSessionCleaned = true;
            } else {
              // 古いユーザーindexが別UserのSessionを指す場合もSession本体は守る。
              refreshSessionCleaned = true;
            }
          }
        } catch {
          cleanupFailed = true;
        }

        // Session本体の削除に失敗した場合はindexを残し、ID未指定の再試行でも再取得できるようにする。
        if (refreshSessionCleaned) {
          try {
            const currentId = await authKv.get(userKey);
            if (currentId === targetId) await authKv.delete(userKey);
          } catch {
            cleanupFailed = true;
          }
        }
      }

      if (cleanupFailed) {
        throw new Error('Refresh Sessionの後片付けに失敗しました');
      }
    },
  };
}
