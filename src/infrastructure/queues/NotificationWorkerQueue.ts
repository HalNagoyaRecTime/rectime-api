import type { Queue } from '@cloudflare/workers-types';
import type { NotificationWorkerMessage } from '../../domain/entities/NotificationWorkerMessage';
import type { INotificationWorkerQueue } from '../../domain/interfaces/queues/INotificationWorkerQueue';

const QUEUE_SEND_BATCH_LIMIT = 100;

export function createNotificationWorkerQueue(
  queue: Queue<NotificationWorkerMessage>
): INotificationWorkerQueue {
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
