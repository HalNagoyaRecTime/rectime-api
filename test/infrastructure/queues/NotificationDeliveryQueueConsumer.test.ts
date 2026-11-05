import type { MessageBatch } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import type { INotificationDeliveryService } from '../../../src/application/services/INotificationDeliveryService';
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

function createDeliveryServiceStub(): INotificationDeliveryService {
  return {
    enqueueReadySchedules: vi.fn(),
    sendQueuedNotifications: vi.fn().mockResolvedValue({
      claimed: 0,
      sent: 0,
      failed: 0,
    }),
  };
}

describe('NotificationDeliveryQueueConsumer', () => {
  it('新通知の送信・状態保存が完了したmessageをackする', async () => {
    const message = createMessage({ notificationScheduleIds: [1, 2] });
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      deliveryService
    );

    expect(deliveryService.sendQueuedNotifications).toHaveBeenCalledWith([
      1, 2,
    ]);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('Deliveryのreject時はretryしackしない', async () => {
    const message = createMessage({ notificationScheduleIds: [1] });
    const deliveryService = createDeliveryServiceStub();
    vi.mocked(deliveryService.sendQueuedNotifications).mockRejectedValueOnce(
      new Error('D1 unavailable')
    );

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      deliveryService
    );

    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
    });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('不正なmessageは再試行せずackする', async () => {
    const message = createMessage({ notificationScheduleIds: [] });
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      deliveryService
    );

    expect(deliveryService.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
  });

  it('共通上限を超えるmessageは再試行せずackする', async () => {
    const message = createMessage({
      notificationScheduleIds: Array.from(
        { length: NOTIFICATION_DELIVERY_MESSAGE_SIZE + 1 },
        (_, index) => index + 1
      ),
    });
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      deliveryService
    );

    expect(deliveryService.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
});

it('再送専用messageは初回送信を呼ばず再送を完了してackする', async () => {
  const message = createMessage({
    notificationScheduleIds: [],
    retryDeliveryIds: [41, 42],
  });
  const delivery = createDeliveryServiceStub();
  const retry = {
    enqueueDueDeliveries: vi.fn(),
    sendClaimedDelivery: vi.fn(),
    retryDueDeliveries: vi
      .fn()
      .mockResolvedValue({ claimed: 2, sent: 2, failed: 0 }),
  };
  await consumeNotificationDeliveryQueue(createBatch(message), delivery, retry);
  expect(retry.retryDueDeliveries).toHaveBeenCalledWith(undefined, [41, 42]);
  expect(delivery.sendQueuedNotifications).not.toHaveBeenCalled();
  expect(message.ack).toHaveBeenCalledOnce();
});
