import type { MessageBatch } from '@cloudflare/workers-types';
import type { NotificationWorkerMessage } from '../../domain/entities/NotificationWorkerMessage';
import {
  NOTIFICATION_WORKER_MESSAGE_SIZE,
  NOTIFICATION_WORKER_RETRY_DELAY_SECONDS,
} from '../../domain/entities/NotificationWorkerMessage';
import type { INotificationWorkerService } from '../../application/services/INotificationWorkerService';

export async function consumeNotificationWorkerQueue(
  batch: MessageBatch<NotificationWorkerMessage>,
  service: INotificationWorkerService
): Promise<void> {
  for (const message of batch.messages) {
    if (!isNotificationWorkerMessage(message.body)) {
      console.error('[NOTIFICATION_WORKER_QUEUE] Invalid message body', {
        messageId: message.id,
      });
      message.ack();
      continue;
    }

    try {
      for (const scheduleId of message.body.notificationScheduleIds) {
        await service.processSchedule(scheduleId);
      }
      message.ack();
    } catch (error) {
      console.error(
        '[NOTIFICATION_WORKER_QUEUE] Worker failed; retry scheduled',
        {
          messageId: message.id,
          attempts: message.attempts,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      message.retry({
        delaySeconds: NOTIFICATION_WORKER_RETRY_DELAY_SECONDS,
      });
    }
  }
}

function isNotificationWorkerMessage(
  value: unknown
): value is NotificationWorkerMessage {
  if (!value || typeof value !== 'object') return false;
  if (!('notificationScheduleIds' in value)) return false;
  const ids = value.notificationScheduleIds;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= NOTIFICATION_WORKER_MESSAGE_SIZE &&
    ids.every(id => Number.isSafeInteger(id) && id > 0)
  );
}
