import type { MessageBatch } from '@cloudflare/workers-types';
import type { INotificationRetryService } from '../../application/services/INotificationRetryService';
import type { INotificationDeliveryService } from '../../application/services/INotificationDeliveryService';
import {
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
  NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
  type NotificationDeliveryMessage,
} from '../../domain/entities/NotificationDelivery';

export async function consumeNotificationDeliveryQueue(
  batch: MessageBatch<NotificationDeliveryMessage>,
  notificationDeliveryService: INotificationDeliveryService,
  retryService?: INotificationRetryService
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
      if (message.body.retryDeliveryIds) {
        if (!retryService) throw new Error('再送Serviceが設定されていません');
        await retryService.retryDueDeliveries(
          undefined,
          message.body.retryDeliveryIds
        );
        message.ack();
        continue;
      }
      await notificationDeliveryService.sendQueuedNotifications(
        message.body.notificationScheduleIds
      );
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

  if ('retryDeliveryIds' in value) {
    const ids = value.retryDeliveryIds;
    return (
      Array.isArray(value.notificationScheduleIds) &&
      value.notificationScheduleIds.length === 0 &&
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= 90 &&
      ids.every(id => Number.isSafeInteger(id) && id > 0)
    );
  }
  const ids = value.notificationScheduleIds;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= NOTIFICATION_DELIVERY_MESSAGE_SIZE &&
    ids.every(id => Number.isSafeInteger(id) && id > 0)
  );
}
