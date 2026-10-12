import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOW,
  repository,
  tokens,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from '../../notificationDeliveryFixtures';
import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';
import { FcmRequestError } from '../../../src/application/services/IFcmService';

import {
  FCM_RETRY_OFFSETS_SECONDS,
  FCM_RETRY_WINDOW_SECONDS,
  FCM_MAX_ATTEMPTS,
} from '../../../src/domain/entities/NotificationRetryPolicy';
describe('再送設定変更時のD1とServiceの整合', () => {
  beforeEach(clearNotificationFixtures);

  it('設定の最終予定と試行回数に合わせて最後の再送を予約し送信する', async () => {
    const { delivery } = await createDeliveryFixture();
    await env.DB.prepare(
      'UPDATE notification_push_deliveries SET attempt_count = ? WHERE notification_push_delivery_id = ?'
    )
      .bind(FCM_MAX_ATTEMPTS - 1, delivery.notification_push_delivery_id)
      .run();
    const sendNotificationToToken = vi
      .fn()
      .mockRejectedValueOnce(
        new FcmRequestError(503, 'UNAVAILABLE', '一時失敗')
      )
      .mockResolvedValue({
        success: true,
        messageId: 'projects/test/messages/retry',
      });
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken },
    });
    expect(
      await service.sendClaimedDelivery(
        { ...delivery, attempt_count: FCM_MAX_ATTEMPTS - 1 },
        new Date(
          NOW.getTime() +
            FCM_RETRY_OFFSETS_SECONDS[FCM_RETRY_OFFSETS_SECONDS.length - 2] *
              1000
        )
      )
    ).toBe('retry_wait');
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      next_retry_at: new Date(
        NOW.getTime() + Math.max(...FCM_RETRY_OFFSETS_SECONDS) * 1000
      ).toISOString(),
    });
    await service.retryDueDeliveries(
      new Date(
        NOW.getTime() + (Math.max(...FCM_RETRY_OFFSETS_SECONDS) + 60) * 1000
      )
    );
    expect(sendNotificationToToken).toHaveBeenCalledTimes(2);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'sent',
      attempt_count: FCM_MAX_ATTEMPTS,
    });
  });

  it('設定から計算した期限を超えた行を取得せず終端する', async () => {
    const { delivery } = await createDeliveryFixture();
    await repository.saveRetry(
      delivery.notification_push_delivery_id,
      1,
      '一時失敗',
      NOW.toISOString(),
      NOW.toISOString()
    );
    const now = new Date(
      NOW.getTime() + FCM_RETRY_WINDOW_SECONDS * 1000 + 1
    ).toISOString();
    expect(
      await repository.claimRetryDeliveries(now, NOW.toISOString(), 100)
    ).toEqual([]);
    await repository.retireUnsendableDeliveries(
      now,
      NOW.toISOString(),
      FCM_MAX_ATTEMPTS
    );
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'failed' });
  });
});
