import { describe, expect, it, vi } from 'vitest';
import { consumeNotificationWorkerQueue } from '../../../src/infrastructure/queues/NotificationWorkerQueueConsumer';
import type { INotificationWorkerService } from '../../../src/application/services/INotificationWorkerService';
import type { NotificationWorkerMessage } from '../../../src/domain/entities/NotificationWorkerMessage';

function createBatch(
  body: unknown,
  service: Partial<INotificationWorkerService> = {}
) {
  const ack = vi.fn();
  const retry = vi.fn();
  const message = {
    id: 'message-1',
    attempts: 1,
    body,
    ack,
    retry,
  };
  return {
    batch: {
      messages: [message],
    } as unknown as MessageBatch<NotificationWorkerMessage>,
    ack,
    retry,
    service: {
      processSchedule: vi.fn().mockResolvedValue({
        resolved: true,
        generated: true,
        sent: 1,
        retryWait: 0,
        failed: 0,
      }),
      ...service,
    } as INotificationWorkerService,
  };
}

describe('NotificationWorkerQueueConsumer', () => {
  it('Schedule IDをWorkerへ渡して成功時にackする', async () => {
    const { batch, ack, service } = createBatch({
      notificationScheduleIds: [1, 2],
    });

    await consumeNotificationWorkerQueue(batch, service);

    expect(service.processSchedule).toHaveBeenNthCalledWith(1, 1);
    expect(service.processSchedule).toHaveBeenNthCalledWith(2, 2);
    expect(ack).toHaveBeenCalledOnce();
  });

  it('不正なQueue messageはackして捨てる', async () => {
    const { batch, ack, retry, service } = createBatch({
      notificationScheduleIds: [0],
    });

    await consumeNotificationWorkerQueue(batch, service);

    expect(service.processSchedule).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('Worker失敗時はQueue retryする', async () => {
    const processSchedule = vi
      .fn()
      .mockRejectedValue(new Error('temporary failure'));
    const { batch, ack, retry, service } = createBatch(
      { notificationScheduleIds: [1] },
      { processSchedule }
    );

    await consumeNotificationWorkerQueue(batch, service);

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 300 });
  });
});
