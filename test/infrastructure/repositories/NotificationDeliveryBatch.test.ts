import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';
import { FcmRequestError } from '../../../src/application/services/IFcmService';
import type {
  ClaimedNotificationPushDelivery,
  NotificationDeliveryWrite,
} from '../../../src/domain/entities/NotificationDelivery';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';
import {
  NOW,
  repository,
  tokens,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from '../../notificationDeliveryFixtures';

describe('Push DeliveryのD1バッチ処理', () => {
  beforeEach(clearNotificationFixtures);

  it('5件のlease検証と結果保存をそれぞれ1回のRepository呼び出しにまとめる', async () => {
    const { delivery } = await createDeliveryFixture();
    const deliveries = Array.from({ length: 5 }, (_, index) => ({
      ...delivery,
      notification_push_delivery_id: index + 1000,
    })) as ClaimedNotificationPushDelivery[];
    const renewDeliveryLeases = vi.fn(async () =>
      deliveries.map(value => value.notification_push_delivery_id)
    );
    const saveClaimedDeliveryResults = vi.fn(
      async (_writes: NotificationDeliveryWrite[]) =>
        deliveries.map(() => 'sent' as const)
    );
    const sendNotificationToToken = vi.fn(async () => ({
      success: true as const,
      messageId: 'batch-ok',
    }));
    const service = createNotificationRetryService({
      notificationDeliveryRepository: {
        renewDeliveryLeases,
        saveClaimedDeliveryResults,
      } as unknown as INotificationDeliveryRepository,
      firebaseTokenRepository: { deleteById: vi.fn() },
      fcmService: { sendNotificationToToken },
    });

    expect(await service.sendClaimedDeliveries(deliveries, NOW)).toEqual(
      Array.from({ length: 5 }, () => 'sent')
    );
    expect(renewDeliveryLeases).toHaveBeenCalledOnce();
    expect(saveClaimedDeliveryResults).toHaveBeenCalledOnce();
    expect(saveClaimedDeliveryResults.mock.calls[0][0]).toHaveLength(5);
    expect(sendNotificationToToken).toHaveBeenCalledTimes(5);
  });

  it('実D1でFCM送信結果を保存する', async () => {
    const { delivery } = await createDeliveryFixture();
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: {
        sendNotificationToToken: vi.fn(async () => ({
          success: true as const,
          messageId: 'batch-sent',
        })),
      },
    });

    expect(await service.sendClaimedDeliveries([delivery], NOW)).toEqual([
      'sent',
    ]);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'sent',
      fcm_message_id: 'batch-sent',
    });
  });

  it('FCMの一時失敗はretry_waitとして結果を保存する', async () => {
    const { delivery } = await createDeliveryFixture();
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: {
        sendNotificationToToken: vi.fn(async () => {
          throw new FcmRequestError(503, 'UNAVAILABLE', '一時失敗');
        }),
      },
    });

    expect(await service.sendClaimedDeliveries([delivery], NOW)).toEqual([
      'retry_wait',
    ]);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'retry_wait',
      next_retry_at: new Date(NOW.getTime() + 10_000).toISOString(),
    });
  });

  it('停止済みScheduleはleaseを取得できず送信しない', async () => {
    const { delivery, scheduleId } = await createDeliveryFixture();
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'stopped' WHERE notification_schedule_id = ?"
    )
      .bind(scheduleId)
      .run();
    const sendNotificationToToken = vi.fn();
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken },
    });

    expect(await service.sendClaimedDeliveries([delivery], NOW)).toEqual([
      'superseded',
    ]);
    expect(sendNotificationToToken).not.toHaveBeenCalled();
  });
});
