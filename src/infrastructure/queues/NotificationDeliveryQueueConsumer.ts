import type { MessageBatch } from '@cloudflare/workers-types';
import type { IScheduledNotificationService } from '../../application/services/IScheduledNotificationService';
import type { NotificationDeliveryMessage } from '../../domain/entities/NotificationDelivery';

const QUEUE_RETRY_DELAY_SECONDS = 5 * 60;

export async function consumeNotificationDeliveryQueue(
  batch: MessageBatch<NotificationDeliveryMessage>,
  service: IScheduledNotificationService
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
      await service.sendQueuedNotifications(
        message.body.notificationScheduleIds
      );
      message.ack();
    } catch (error) {
      console.error('[NOTIFICATION_QUEUE] Delivery failed; retry scheduled', {
        messageId: message.id,
        attempts: message.attempts,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds: QUEUE_RETRY_DELAY_SECONDS });
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
    ids.length <= 15 &&
    ids.every(id => Number.isSafeInteger(id) && id > 0)
  );
}
