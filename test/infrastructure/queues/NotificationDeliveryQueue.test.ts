import type { Queue } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationDeliveryMessage } from '../../../src/domain/entities/NotificationDelivery';
import { createNotificationDeliveryQueue } from '../../../src/infrastructure/queues/NotificationDeliveryQueue';

describe('NotificationDeliveryQueue', () => {
  it('Cloudflareの上限に合わせて100messageずつsendBatchする', async () => {
    const queue = {
      sendBatch: vi.fn(),
    } as unknown as Queue<NotificationDeliveryMessage>;
    const adapter = createNotificationDeliveryQueue(queue);
    const messages = Array.from({ length: 147 }, (_, index) => ({
      notificationScheduleIds: [index + 1],
    }));

    await adapter.enqueueMany(messages);

    expect(queue.sendBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(queue.sendBatch).mock.calls[0][0]).toHaveLength(100);
    expect(vi.mocked(queue.sendBatch).mock.calls[1][0]).toHaveLength(47);
  });
});
