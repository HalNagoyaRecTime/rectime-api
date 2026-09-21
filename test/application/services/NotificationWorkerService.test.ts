import { describe, expect, it, vi } from 'vitest';
import { createNotificationWorkerService } from '../../../src/application/services/NotificationWorkerService';
import type { INotificationWorkerQueue } from '../../../src/domain/interfaces/queues/INotificationWorkerQueue';
import type { INotificationAudienceResolverRepository } from '../../../src/domain/interfaces/repositories/INotificationAudienceResolverRepository';
import type { INotificationPushDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationPushDeliveryRepository';
import type { INotificationAudienceResolverService } from '../../../src/application/services/INotificationAudienceResolverService';
import type { INotificationPushDeliveryService } from '../../../src/application/services/INotificationPushDeliveryService';
import type { INotificationRetryService } from '../../../src/application/services/INotificationRetryService';

function setup() {
  const audienceResolverRepository: INotificationAudienceResolverRepository = {
    findDueScheduleIds: vi
      .fn()
      .mockResolvedValue(Array.from({ length: 16 }, (_, index) => index + 1)),
    claimScheduleForResolution: vi.fn(),
    isScheduleResolutionAllowed: vi.fn(),
    findUnresolvedAudiences: vi.fn(),
    findAudienceUserIds: vi.fn(),
    insertRecipients: vi.fn(),
    markAudienceResolved: vi.fn(),
    markRecipientsResolved: vi.fn(),
  };
  const pushDeliveryRepository: INotificationPushDeliveryRepository = {
    isDeliveryGenerationAllowed: vi.fn(),
    createPendingDeliveries: vi.fn(),
    findPendingDeliveryIds: vi.fn().mockResolvedValue([10, 11]),
    markScheduleSending: vi.fn(),
    claimPendingDelivery: vi.fn(),
    markDeliverySent: vi.fn(),
    markDeliveryFailed: vi.fn(),
    completeScheduleIfIdle: vi.fn(),
    markScheduleFailed: vi.fn(),
  };
  const audienceResolverService: INotificationAudienceResolverService = {
    resolveSchedule: vi.fn().mockResolvedValue({
      status: 'resolved',
      audienceCount: 1,
      recipientCount: 2,
    }),
  };
  const pushDeliveryService: INotificationPushDeliveryService = {
    generateDeliveries: vi.fn().mockResolvedValue({
      status: 'generated',
      createdCount: 2,
    }),
    sendDelivery: vi
      .fn()
      .mockResolvedValueOnce({ status: 'sent', scheduleCompleted: false })
      .mockResolvedValueOnce({
        status: 'retry_wait',
        scheduleCompleted: false,
      }),
  };
  const retryService: INotificationRetryService = {
    handleFcmFailure: vi.fn(),
    retryDueDeliveries: vi.fn().mockResolvedValue({
      checked: 2,
      sent: 1,
      retried: 1,
      failed: 0,
    }),
    recoverProcessingTimeouts: vi.fn().mockResolvedValue({
      checked: 1,
      sent: 0,
      retried: 0,
      failed: 1,
    }),
  };
  const queue: INotificationWorkerQueue = {
    enqueueMany: vi.fn(),
  };
  return {
    audienceResolverRepository,
    pushDeliveryRepository,
    audienceResolverService,
    pushDeliveryService,
    retryService,
    queue,
    service: createNotificationWorkerService({
      audienceResolverRepository,
      pushDeliveryRepository,
      audienceResolverService,
      pushDeliveryService,
      retryService,
      queue,
    }),
  };
}

describe('NotificationWorkerService', () => {
  it('due scheduleを15件単位でQueueへ積む', async () => {
    const { service, queue } = setup();

    const result = await service.enqueueDueSchedules(
      new Date('2026-11-07T06:35:00.000Z')
    );

    expect(result).toEqual({ queuedSchedules: 16, queuedMessages: 2 });
    expect(queue.enqueueMany).toHaveBeenCalledWith([
      { notificationScheduleIds: Array.from({ length: 15 }, (_, i) => i + 1) },
      { notificationScheduleIds: [16] },
    ]);
  });

  it('ResolverからDelivery生成・送信までを1つのSchedule単位で実行する', async () => {
    const { service, audienceResolverService, pushDeliveryService } = setup();

    const result = await service.processSchedule(20);

    expect(result).toEqual({
      resolved: true,
      generated: true,
      sent: 1,
      retryWait: 1,
      failed: 0,
    });
    expect(audienceResolverService.resolveSchedule).toHaveBeenCalledWith(
      20,
      expect.any(Date)
    );
    expect(pushDeliveryService.generateDeliveries).toHaveBeenCalledWith(
      20,
      expect.any(Date)
    );
    expect(pushDeliveryService.sendDelivery).toHaveBeenCalledTimes(2);
  });

  it('Retryとprocessing timeout回収を既存Retry Serviceへ委譲する', async () => {
    const { service, retryService } = setup();

    await service.retryDueDeliveries();
    await service.recoverProcessingTimeouts();

    expect(retryService.retryDueDeliveries).toHaveBeenCalledTimes(1);
    expect(retryService.recoverProcessingTimeouts).toHaveBeenCalledTimes(1);
  });
});
