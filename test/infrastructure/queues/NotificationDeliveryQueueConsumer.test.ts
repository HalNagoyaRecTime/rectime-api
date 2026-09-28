import type { MessageBatch } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import type { INotificationDeliveryService } from '../../../src/application/services/INotificationDeliveryService';
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

function createLegacyService(): IScheduledNotificationService {
  return {
    enqueueDueNotifications: vi.fn(),
    sendQueuedNotifications: vi.fn(),
  };
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
  it('legacyと新通知の送信・状態保存が完了したmessageをackする', async () => {
    const message = createMessage({ notificationScheduleIds: [1, 2] });
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );

    expect(legacyService.sendQueuedNotifications).toHaveBeenCalledWith([1, 2]);
    expect(deliveryService.sendQueuedNotifications).toHaveBeenCalledWith([
      1, 2,
    ]);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('legacyのreject後もDelivery処理の完了を待ってからretryする', async () => {
    const message = createMessage({ notificationScheduleIds: [1] });
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();
    vi.mocked(legacyService.sendQueuedNotifications).mockRejectedValueOnce(
      new Error('legacy unavailable')
    );

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );

    expect(deliveryService.sendQueuedNotifications).toHaveBeenCalledOnce();
    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
    });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('Deliveryのreject時はlegacy完了後にretryしackしない', async () => {
    const message = createMessage({ notificationScheduleIds: [1] });
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();
    vi.mocked(deliveryService.sendQueuedNotifications).mockRejectedValueOnce(
      new Error('D1 unavailable')
    );

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );

    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
    });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('片方が即rejectしても、もう片方の遅延完了まではretryしない', async () => {
    const message = createMessage({ notificationScheduleIds: [1] });
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();
    vi.mocked(legacyService.sendQueuedNotifications).mockRejectedValueOnce(
      new Error('legacy unavailable')
    );

    let finishDelivery!: () => void;
    let deliveryStarted!: () => void;
    const deliveryStartedPromise = new Promise<void>(resolve => {
      deliveryStarted = resolve;
    });
    const deliveryCompletion = new Promise<void>(resolve => {
      finishDelivery = resolve;
    });
    vi.mocked(deliveryService.sendQueuedNotifications).mockImplementationOnce(
      () => {
        deliveryStarted();
        return deliveryCompletion.then(() => ({
          claimed: 1,
          sent: 1,
          failed: 0,
        }));
      }
    );

    const consumePromise = consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );
    await deliveryStartedPromise;

    expect(message.retry).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();

    finishDelivery();
    await consumePromise;

    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS,
    });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it('不正なmessageは再試行せずackする', async () => {
    const message = createMessage({ notificationScheduleIds: [] });
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );

    expect(legacyService.sendQueuedNotifications).not.toHaveBeenCalled();
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
    const legacyService = createLegacyService();
    const deliveryService = createDeliveryServiceStub();

    await consumeNotificationDeliveryQueue(
      createBatch(message),
      legacyService,
      deliveryService
    );

    expect(legacyService.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(deliveryService.sendQueuedNotifications).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
});
