import { describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createScheduledNotificationService } from '../../../src/application/services/ScheduledNotificationService';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

function setup() {
  let configured = false;
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const emptyLists = new Set([
    'findReadySchedules',
    'findDeliveryCandidateIds',
    'claimPendingDeliveries',
    'claimForDelivery',
  ]);
  const repository = new Proxy(
    {},
    {
      get: (_, key: string) => {
        if (!calls.has(key))
          calls.set(
            key,
            vi.fn().mockResolvedValue(emptyLists.has(key) ? [] : 0)
          );
        return calls.get(key);
      },
    }
  );
  const shared = {
    firebaseTokenRepository: repository as IFirebaseTokenRepository,
    notificationDeliveryQueue: {
      enqueueMany: vi.fn().mockResolvedValue(undefined),
    },
    fcmService: { sendNotificationToToken: vi.fn() },
    ensureConfigured: async () => {
      if (!configured)
        throw new Error('Missing Cloudflare Secrets: FIREBASE_PRIVATE_KEY');
    },
  };
  return {
    delivery: createNotificationDeliveryService({
      ...shared,
      notificationDeliveryRepository:
        repository as INotificationDeliveryRepository,
    }),
    legacy: createScheduledNotificationService({
      ...shared,
      notificationScheduleRepository:
        repository as INotificationScheduleRepository,
    }),
    calls,
    recover: () => {
      configured = true;
    },
  };
}

describe('通知設定不備時の配信保留', () => {
  it.each(['delivery', 'legacy'] as const)(
    '%s: 準備とclaimの前に停止し、設定修正後は同じ処理を再開できる',
    async kind => {
      const { delivery, legacy, calls, recover } = setup();
      const prepare = () =>
        kind === 'delivery'
          ? delivery.enqueueReadySchedules()
          : legacy.enqueueDueNotifications();
      const send = () =>
        kind === 'delivery'
          ? delivery.sendQueuedNotifications([1])
          : legacy.sendQueuedNotifications([1]);
      await expect(prepare()).rejects.toThrow('FIREBASE_PRIVATE_KEY');
      await expect(send()).rejects.toThrow('FIREBASE_PRIVATE_KEY');
      expect(
        [...calls.values()].every(call => call.mock.calls.length === 0)
      ).toBe(true);
      recover();
      await prepare();
      await send();
      expect(
        calls.get(
          kind === 'delivery' ? 'claimPendingDeliveries' : 'claimForDelivery'
        )
      ).toHaveBeenCalledOnce();
      expect(calls.get('markFailed')).toBeUndefined();
      expect(calls.get('markScheduleFailed')).toBeUndefined();
    }
  );
});
