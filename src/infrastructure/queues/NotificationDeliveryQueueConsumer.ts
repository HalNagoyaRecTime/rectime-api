import type { MessageBatch } from '@cloudflare/workers-types';
import type { INotificationDeliveryService } from '../../application/services/INotificationDeliveryService';
import type { IScheduledNotificationService } from '../../application/services/IScheduledNotificationService';
import {
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
  NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
  type NotificationDeliveryMessage,
} from '../../domain/entities/NotificationDelivery';

export async function consumeNotificationDeliveryQueue(
  batch: MessageBatch<NotificationDeliveryMessage>,
  legacyService: IScheduledNotificationService,
  notificationDeliveryService: INotificationDeliveryService
): Promise<void> {
  for (const message of batch.messages) {
    if (!isNotificationDeliveryMessage(message.body)) {
      console.error('[NOTIFICATION_QUEUE] Invalid message body', {
        messageId: message.id,
      });
      message.ack();
      continue;
    }

    try {
      const [legacyResult, deliveryResult] = await Promise.allSettled([
        Promise.resolve().then(() =>
          legacyService.sendQueuedNotifications(
            message.body.notificationScheduleIds
          )
        ),
        Promise.resolve().then(() =>
          notificationDeliveryService.sendQueuedNotifications(
            message.body.notificationScheduleIds
          )
        ),
      ]);
      if (
        legacyResult.status === 'rejected' ||
        deliveryResult.status === 'rejected'
      ) {
        console.error(
          '[NOTIFICATION_QUEUE] 送信に失敗したためQueue Messageを再試行します',
          {
            messageId: message.id,
            attempts: message.attempts,
            legacyFailed: legacyResult.status === 'rejected',
            deliveryFailed: deliveryResult.status === 'rejected',
          }
        );
        message.retry({
          delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
        });
        continue;
      }
      message.ack();
    } catch (error) {
      console.error(
        '[NOTIFICATION_QUEUE] Queue Consumerで予期しないエラーが発生しました',
        {
          messageId: message.id,
          attempts: message.attempts,
          error: error instanceof Error ? error.name : 'UnknownError',
        }
      );
      message.retry({
        delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
      });
    }
  }
}

function isNotificationDeliveryMessage(
  value: unknown
): value is NotificationDeliveryMessage {
  if (!value || typeof value !== 'object') return false;
  if (!('notificationScheduleIds' in value)) return false;

  const ids = value.notificationScheduleIds;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= NOTIFICATION_DELIVERY_MESSAGE_SIZE &&
    ids.every(id => Number.isSafeInteger(id) && id > 0)
  );
}
