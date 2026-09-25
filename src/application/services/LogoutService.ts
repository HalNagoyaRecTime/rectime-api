import type { KVNamespace } from '@cloudflare/workers-types';
import type { MobileRefreshEntry } from '../../domain/auth/types';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';

interface LogoutInput {
  userId: string;
  refreshTokenId?: string;
  fcmToken?: string;
}

export function createLogoutService(
  firebaseTokenRepository: Pick<
    IFirebaseTokenRepository,
    'deleteByUserIdAndFcmToken'
  >,
  authKv: KVNamespace
) {
  return {
    async logout(input: LogoutInput): Promise<void> {
      let failed = false;
      const attempt = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
        } catch {
          failed = true;
        }
      };

      if (input.fcmToken) {
        const fcmToken = input.fcmToken;
        await attempt(() => {
          const userId = Number(input.userId);
          if (!Number.isSafeInteger(userId) || userId <= 0) {
            throw new Error('認証済みユーザーIDが不正です');
          }
          return firebaseTokenRepository.deleteByUserIdAndFcmToken(
            userId,
            fcmToken
          );
        });
      }

      if (input.refreshTokenId) {
        await attempt(async () => {
          const refreshKey = `mobile_refresh:${input.refreshTokenId}`;
          const refreshRaw = await authKv.get(refreshKey);
          if (!refreshRaw) return;

          const entry = JSON.parse(refreshRaw) as MobileRefreshEntry;
          if (entry.user_id === input.userId) {
            await authKv.delete(refreshKey);
          }
        });
      }

      await attempt(() =>
        authKv.delete(`mobile_refresh_by_user:${input.userId}`)
      );

      if (failed) throw new Error('ログアウト処理の後片付けに失敗しました');
    },
  };
}
