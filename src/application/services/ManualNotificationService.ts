import {
  CreateManualNotificationInput,
  MANUAL_NOTIFICATION_PRIORITY,
  ManualNotificationSendResult,
} from '../../domain/entities/ManualNotification';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { IManualNotificationRepository } from '../../domain/interfaces/repositories/IManualNotificationRepository';
import { IFcmService } from './IFcmService';
import { IManualNotificationService } from './IManualNotificationService';

export function createManualNotificationService(deps: {
  manualNotificationRepository: IManualNotificationRepository;
  firebaseTokenRepository: IFirebaseTokenRepository;
  fcmService: IFcmService;
}): IManualNotificationService {
  const { manualNotificationRepository, firebaseTokenRepository, fcmService } =
    deps;

  return {
    async sendManualNotification(
      input: CreateManualNotificationInput
    ): Promise<ManualNotificationSendResult> {
      const targetIds = input.targetType === 'all' ? [] : input.targetIds;
      const notification = await manualNotificationRepository.create({
        title: input.title,
        body: input.body,
      });

      const tokens =
        input.targetType === 'all'
          ? await firebaseTokenRepository.findActiveTokensForAllUsers()
          : await firebaseTokenRepository.findActiveTokensForGroups(targetIds);

      let sent = 0;
      let failed = 0;

      for (const token of tokens) {
        try {
          const result = await fcmService.sendNotificationToToken({
            token: token.fcm_token,
            title: input.title,
            body: input.body,
            data: {
              type: 'manual',
              notificationId: String(notification.id),
              priority: String(MANUAL_NOTIFICATION_PRIORITY),
            },
          });

          console.info('Manual notification sent', {
            notificationId: notification.id,
            firebaseTokenId: token.id,
            messageId: result.messageId,
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          console.error('Failed to send manual notification', {
            notificationId: notification.id,
            firebaseTokenId: token.id,
            error: error instanceof Error ? error.message : String(error),
          });

          if (shouldDeactivateToken(error)) {
            await firebaseTokenRepository.deactivate(token.id);
          }
        }
      }

      return {
        notificationId: notification.id,
        targetType: input.targetType,
        targetIds,
        priority: MANUAL_NOTIFICATION_PRIORITY,
        tokens: tokens.length,
        sent,
        failed,
      };
    },
  };
}

function shouldDeactivateToken(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('UNREGISTERED') ||
    message.includes('invalid token') ||
    message.includes('INVALID_ARGUMENT')
  );
}
