import { env } from 'cloudflare:workers';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  NOW,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
  tokens,
} from '../../notificationDeliveryFixtures';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';

beforeEach(clearNotificationFixtures);
it('設定不備では準備済み・Queue投入済みautomaticの初回と再送を保留し、manualは送信できる', async () => {
  const fixture = await createDeliveryFixture();
  await env.DB.prepare(
    "UPDATE notifications SET source_type = 'gathering', source_id = 1, source_hash = 'test-date' WHERE notification_id = ?"
  )
    .bind(fixture.notificationId)
    .run();
  const repository = createNotificationDeliveryRepository(env.DB, {
    automaticDeliveryEnabled: false,
  });
  const sendNotificationToToken = vi
    .fn()
    .mockResolvedValue({ success: true, messageId: 'manual-ok' });
  const retry = createNotificationRetryService({
    notificationDeliveryRepository: repository,
    firebaseTokenRepository: tokens,
    fcmService: { sendNotificationToToken },
  });
  expect(await retry.sendClaimedDelivery(fixture.delivery, NOW)).toBe(
    'superseded'
  );
  const later = new Date(NOW.getTime() + 121_000);
  await retry.retryDueDeliveries(later);
  expect(sendNotificationToToken).not.toHaveBeenCalled();
  expect(
    await getDelivery(fixture.delivery.notification_push_delivery_id)
  ).toMatchObject({ status: 'sending', attempt_count: 1 });
  await env.DB.prepare(
    "UPDATE notification_push_deliveries SET status = 'pending'"
  ).run();
  expect(await repository.findReadySchedules(NOW.toISOString(), 100)).toEqual(
    []
  );
  expect(
    await repository.claimPendingDeliveries(
      [fixture.scheduleId],
      NOW.toISOString(),
      5
    )
  ).toEqual([]);
  // 同じ配信処理でmanualを送信できることも確認する。
  await env.DB.prepare(
    'UPDATE notifications SET source_type = NULL, source_id = NULL, source_hash = NULL WHERE notification_id = ?'
  )
    .bind(fixture.notificationId)
    .run();
  const [manual] = await repository.claimPendingDeliveries(
    [fixture.scheduleId],
    NOW.toISOString(),
    5
  );
  expect(await retry.sendClaimedDelivery(manual, NOW)).toBe('sent');
  expect(sendNotificationToToken).toHaveBeenCalledOnce();
});
