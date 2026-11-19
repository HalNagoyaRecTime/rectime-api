import { describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import type { INotificationRetryService } from '../../../src/application/services/INotificationRetryService';
import {
  NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
  type ClaimedNotificationPushDelivery,
  type NotificationDeliveryMessage,
} from '../../../src/domain/entities/NotificationDelivery';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';

const NOW = new Date('2026-11-19T00:00:00.000Z');

function createHarness(count: number) {
  const pending = new Set(
    Array.from({ length: count }, (_, index) => index + 1)
  );
  const sending = new Set<number>();
  const sent = new Set<number>();
  const messages: NotificationDeliveryMessage[] = [];
  const enqueueMany = vi.fn(async (batch: NotificationDeliveryMessage[]) => {
    messages.push(...batch);
  });
  const completeScheduleIfDone = vi.fn(
    async () => pending.size === 0 && sending.size === 0
  );
  const repo = {
    findReadySchedules: vi.fn(async () => [
      { notification_schedule_id: 1, send_status: 'sending' as const },
    ]),
    hasPendingDeliveries: vi.fn(async () => pending.size > 0),
    findPendingDeliveryIds: vi.fn(
      async (
        _scheduleIds: number[],
        limit: number,
        _manualOnly?: boolean,
        afterId = 0
      ) => [...pending].filter(id => id > afterId).slice(0, limit)
    ),
    claimPendingDeliveries: vi.fn(async (ids: number[]) => {
      const claimed = ids.filter(id => pending.delete(id));
      for (const id of claimed) sending.add(id);
      return claimed.map(id => ({
        notification_push_delivery_id: id,
        notification_schedule_id: 1,
      })) as ClaimedNotificationPushDelivery[];
    }),
    markPendingDeliveriesWithoutTokenFailed: vi.fn(async () => 0),
    completeScheduleIfDone,
  } as unknown as INotificationDeliveryRepository;
  const retry = {
    sendClaimedDeliveries: vi.fn(
      async (deliveries: ClaimedNotificationPushDelivery[]) => {
        for (const delivery of deliveries) {
          sending.delete(delivery.notification_push_delivery_id);
          sent.add(delivery.notification_push_delivery_id);
        }
        return deliveries.map(() => 'sent' as const);
      }
    ),
  } as unknown as INotificationRetryService;
  const service = createNotificationDeliveryService({
    notificationDeliveryRepository: repo,
    notificationRetryService: retry,
    notificationDeliveryQueue: { enqueueMany },
    firebaseTokenRepository: { deleteById: vi.fn() },
    fcmService: { sendNotificationToToken: vi.fn() },
  });
  return {
    service,
    repo,
    pending,
    sending,
    sent,
    messages,
    enqueueMany,
    completeScheduleIfDone,
  };
}

describe('Delivery IDによる並列Queue配送', () => {
  it('1,000件を300・300・300・100件へ分割して1回のCronで投入する', async () => {
    const h = createHarness(1000);
    const result = await h.service.enqueueReadySchedules(NOW);
    expect(result.queued_schedule_ids).toEqual([1]);
    expect(h.messages.map(message => message.deliveryIds?.length)).toEqual([
      300, 300, 300, 100,
    ]);
    expect(
      h.messages.every(message => message.notificationScheduleIds.length === 0)
    ).toBe(true);
    const ids = h.messages.flatMap(message => message.deliveryIds ?? []);
    expect(new Set(ids).size).toBe(1000);
    expect(ids).toEqual(Array.from({ length: 1000 }, (_, index) => index + 1));
    expect(h.enqueueMany).toHaveBeenCalledOnce();
  });

  it('1万件でも34個のメッセージを1回のCronで投入する', async () => {
    const h = createHarness(10_000);
    await h.service.enqueueReadySchedules(NOW);
    expect(h.messages).toHaveLength(34);
    expect(
      h.messages.flatMap(message => message.deliveryIds ?? [])
    ).toHaveLength(10_000);
    expect(h.enqueueMany).toHaveBeenCalledOnce();
  });

  it('並列処理とメッセージ重複でも各Deliveryを一度だけclaimする', async () => {
    const h = createHarness(1000);
    await h.service.enqueueReadySchedules(NOW);
    const batches = h.messages.map(message => message.deliveryIds ?? []);
    await Promise.all(
      [...batches, batches[0]].map(ids =>
        h.service.sendQueuedDeliveryIds(ids, NOW)
      )
    );
    expect(h.sent.size).toBe(1000);
    expect(h.pending.size).toBe(0);
    expect(h.sending.size).toBe(0);
    expect(h.completeScheduleIfDone).toHaveBeenCalled();
  });

  it('Queue登録失敗後は次のCronで同じ未送信分を回収できる', async () => {
    const h = createHarness(301);
    h.enqueueMany.mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(h.service.enqueueReadySchedules(NOW)).rejects.toThrow(
      'Queue unavailable'
    );
    expect(h.pending.size).toBe(301);
    await h.service.enqueueReadySchedules(NOW);
    expect(h.enqueueMany).toHaveBeenCalledTimes(2);
    expect(h.messages.map(message => message.deliveryIds?.length)).toEqual([
      300, 1,
    ]);
  });

  it('300件の送信権を失ったときはFCM送信しない', async () => {
    const h = createHarness(NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT);
    vi.mocked(h.repo.claimPendingDeliveries).mockResolvedValue([]);
    const ids = Array.from(
      { length: NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT },
      (_, index) => index + 1
    );
    expect(await h.service.sendQueuedDeliveryIds(ids, NOW)).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
    });
    expect(h.pending.size).toBe(300);
    expect(h.sent.size).toBe(0);
  });

  it('多数のScheduleが重なっても最初のScheduleが投入枠を独占しない', async () => {
    const h = createHarness(1000);
    vi.mocked(h.repo.findReadySchedules).mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => ({
        notification_schedule_id: index + 1,
        send_status: 'sending' as const,
      }))
    );
    vi.mocked(h.repo.findPendingDeliveryIds).mockImplementation(
      async (ids: number[]) => [ids[0]]
    );
    await h.service.enqueueReadySchedules(NOW);
    expect(h.messages).toHaveLength(100);
    expect(h.messages.map(message => message.deliveryIds?.[0])).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1)
    );
    expect(h.enqueueMany).toHaveBeenCalledTimes(3);
  });
});
