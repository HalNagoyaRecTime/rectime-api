import type { LogoutRequestDto } from '../dto/LogoutRequestDto';
import { LogoutCleanupFailedError } from '../errors/LogoutCleanupFailedError';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import type { IRefreshSessionRepository } from '../../domain/interfaces/repositories/IRefreshSessionRepository';

interface LogoutInput extends LogoutRequestDto {
  userId: string;
}

export function createLogoutService(
  firebaseTokenRepository: Pick<
    IFirebaseTokenRepository,
    'deleteByUserIdAndFcmToken'
  >,
  refreshSessionRepository: IRefreshSessionRepository
) {
  return {
    async logout(input: LogoutInput): Promise<void> {
      let cleanupFailed = false;
      const attempt = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
        } catch {
          cleanupFailed = true;
        }
      };

      const fcmToken = input.fcm_token;
      if (fcmToken !== undefined) {
        const userId = Number(input.userId);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          cleanupFailed = true;
        } else {
          await attempt(() =>
            firebaseTokenRepository.deleteByUserIdAndFcmToken(userId, fcmToken)
          );
        }
      }

      await attempt(() =>
        refreshSessionRepository.cleanupForUser(
          input.userId,
          input.refresh_token_id
        )
      );

      if (cleanupFailed) throw new LogoutCleanupFailedError();
    },
  };
}
