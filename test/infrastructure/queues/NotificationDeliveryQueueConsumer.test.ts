import type { MessageBatch } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import type { IScheduledNotificationService } from '../../../src/application/services/IScheduledNotificationService';
import {
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
  NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
  type NotificationDeliveryMessage,
} from '../../../src/domain/entities/NotificationDelivery';
import { consumeNotificationDeliveryQueue } from '../../../src/infrastructure/queues/NotificationDeliveryQueueConsumer';

function createMessage(body: unknown) {
  return {
    id: 'message-1',
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createBatch(message: ReturnType<typeof createMessage>) {
  return {
    messages: [message],
    queue: 'rectime-notification-delivery-dev',
  } as unknown as MessageBatch<NotificationDeliveryMessage>;
}

function createService(): IScheduledNotificationService {
  return {
    enqueueDueNotifications: vi.fn(),
    sendQueuedNotifications: vi.fn(),
  };
}

describe('NotificationDeliveryQueueConsumer', () => {
  it('送信と状態保存が完了したmessageをackする', async () => {
    const message = createMessage({ notificationScheduleIds: [1, 2] });
    const service = createService();

    await consumeNotificationDeliveryQueue(createBatch(message), service);

    expect(service.sendQueuedNotifications).toHaveBeenCalledWith([1, 2]);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('処理失敗時は5分後にretryする', async () => {
    const message = createMessage({ notificationScheduleIds: [1] });
    const service = createService();
    vi.mocked(service.sendQueuedNotifications).mockRejectedValueOnce(
      new Error('D1 unavailable')
    );

    await consumeNotificationDeliveryQueue(createBatch(message), service);

    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
    });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('不正なmessageは再試行せずackする', async () => {
    const message = createMessage({ notificationScheduleIds: [] });
    const service = createService();

    await consumeNotificationDeliveryQueue(createBatch(message), service);

    expect(service.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
  });

  it('共通上限を超えるmessageは再試行せずackする', async () => {
    const message = createMessage({
      notificationScheduleIds: Array.from(
        { length: NOTIFICATION_DELIVERY_MESSAGE_SIZE + 1 },
        (_, index) => index + 1
      ),
    });
    const service = createService();

    await consumeNotificationDeliveryQueue(createBatch(message), service);

    expect(service.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
});
