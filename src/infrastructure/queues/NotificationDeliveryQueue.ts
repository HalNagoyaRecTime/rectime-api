import type { Queue } from '@cloudflare/workers-types';
import type { NotificationDeliveryMessage } from '../../domain/entities/NotificationDelivery';
import type { INotificationDeliveryQueue } from '../../domain/interfaces/queues/INotificationDeliveryQueue';

const QUEUE_SEND_BATCH_LIMIT = 100;

export function createNotificationDeliveryQueue(
  queue: Queue<NotificationDeliveryMessage>
): INotificationDeliveryQueue {
  return {
    async enqueueMany(messages) {
      for (
        let offset = 0;
        offset < messages.length;
        offset += QUEUE_SEND_BATCH_LIMIT
      ) {
        await queue.sendBatch(
          messages
            .slice(offset, offset + QUEUE_SEND_BATCH_LIMIT)
            .map(body => ({ body, contentType: 'json' as const }))
        );
      }
    },
  };
}
