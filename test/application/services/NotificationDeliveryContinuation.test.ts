import { describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT } from '../../../src/domain/entities/NotificationDelivery';
import type { ClaimedNotificationPushDelivery } from '../../../src/domain/entities/NotificationDelivery';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';
import type { INotificationRetryService } from '../../../src/application/services/INotificationRetryService';

function createHarness(count: number) {
  const pending = Array.from({ length: count }, (_, i) => i + 1);
  const enqueueMany = vi.fn(
    async (_messages: { notificationScheduleIds: number[] }[]) => {}
  );
  const completeScheduleIfDone = vi.fn(async () => true);
  const repo = {
    findPendingDeliveryIds: vi.fn(async (_ids: number[], limit: number) =>
      pending.slice(0, limit)
    ),
    claimPendingDeliveries: vi.fn(async (ids: number[]) => {
      for (const id of ids) {
        const index = pending.indexOf(id);
        if (index !== -1) pending.splice(index, 1);
      }
      return ids.map(notification_push_delivery_id => ({
        notification_push_delivery_id,
      })) as ClaimedNotificationPushDelivery[];
    }),
    hasPendingDeliveries: vi.fn(async () => pending.length > 0),
    markPendingDeliveriesWithoutTokenFailed: vi.fn(async () => 0),
    completeScheduleIfDone,
  } as unknown as INotificationDeliveryRepository;
  const retry = {
    sendClaimedDelivery: vi.fn(async () => 'sent' as const),
    sendClaimedDeliveries: vi.fn(
      async (deliveries: ClaimedNotificationPushDelivery[]) =>
        deliveries.map(() => 'sent' as const)
    ),
  } as unknown as INotificationRetryService;
  const service = createNotificationDeliveryService({
    notificationDeliveryRepository: repo,
    firebaseTokenRepository: { deleteById: vi.fn() },
    notificationDeliveryQueue: { enqueueMany },
    notificationRetryService: retry,
    fcmService: { sendNotificationToToken: vi.fn() },
  });
  return { service, enqueueMany, pending, completeScheduleIfDone, repo };
}

describe('NotificationDeliveryServiceのQueue継続', () => {
  it('400件を送信して残り1件を即時再投入し、次回に完了する', async () => {
    const h = createHarness(NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT + 1);

    expect(
      await h.service.sendQueuedNotifications(
        [1],
        new Date('2026-11-18T00:00:00Z')
      )
    ).toEqual({
      claimed: NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
      sent: NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
      failed: 0,
    });
    expect(h.pending).toHaveLength(1);
    expect(h.enqueueMany).toHaveBeenCalledTimes(1);
    expect(h.enqueueMany).toHaveBeenCalledWith([
      { notificationScheduleIds: [1] },
    ]);
    expect(h.completeScheduleIfDone).not.toHaveBeenCalled();

    expect(
      await h.service.sendQueuedNotifications(
        [1],
        new Date('2026-11-18T00:00:01Z')
      )
    ).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(h.pending).toHaveLength(0);
    expect(h.enqueueMany).toHaveBeenCalledTimes(1);
    expect(h.completeScheduleIfDone).toHaveBeenCalledOnce();
  });

  it('claim競合で0件なら空のQueue再投入を繰り返さない', async () => {
    const h = createHarness(1);
    vi.mocked(h.repo.claimPendingDeliveries).mockResolvedValue([]);

    expect(
      await h.service.sendQueuedNotifications(
        [1],
        new Date('2026-11-18T00:00:00Z')
      )
    ).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(h.pending).toHaveLength(1);
    expect(h.enqueueMany).not.toHaveBeenCalled();
    expect(h.completeScheduleIfDone).not.toHaveBeenCalled();
  });
  it.each([800, 2000, 10000])(
    '%i件をCronを待たずQueueで全件処理する',
    async count => {
      const h = createHarness(count);
      const processingCount = Math.ceil(
        count / NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT
      );
      for (let index = 0; index < processingCount; index++) {
        await h.service.sendQueuedNotifications(
          [1],
          new Date('2026-11-18T00:00:00Z')
        );
      }
      expect(h.pending).toHaveLength(0);
      expect(h.enqueueMany).toHaveBeenCalledTimes(processingCount - 1);
      expect(h.completeScheduleIfDone).toHaveBeenCalledOnce();
    }
  );
});
