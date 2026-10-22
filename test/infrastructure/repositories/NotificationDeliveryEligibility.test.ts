import { env } from 'cloudflare:workers';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  NOW,
  repository,
  tokens,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from '../../notificationDeliveryFixtures';
import { createNotificationAccountDeletionService } from '../../../src/application/services/NotificationAccountDeletionService';
import { createNotificationAccountDeletionRepository } from '../../../src/infrastructure/repositories/NotificationAccountDeletionRepository';
import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';

beforeEach(clearNotificationFixtures);
it('Recipient匿名化後のToken削除失敗でも初回・再送・確保済みの送信を拒否し、履歴を残す', async () => {
  const fixture = await createDeliveryFixture();
  const deletion = createNotificationAccountDeletionService({
    firebaseTokenRepository: {
      findAllByUserId: id => tokens.findAllByUserId(id),
      deleteByUserId: async () => {
        throw new Error('Token削除失敗');
      },
    },
    notificationAccountDeletionRepository:
      createNotificationAccountDeletionRepository(env.DB),
  });
  await expect(
    deletion.purgeUserNotificationData(fixture.userId)
  ).rejects.toThrow('Token削除失敗');
  expect(await tokens.findAllByUserId(fixture.userId)).toHaveLength(1);
  const sendNotificationToToken = vi.fn();
  const retry = createNotificationRetryService({
    notificationDeliveryRepository: repository,
    firebaseTokenRepository: tokens,
    fcmService: { sendNotificationToToken },
  });
  expect(await retry.sendClaimedDelivery(fixture.delivery, NOW)).toBe(
    'superseded'
  );
  await env.DB.prepare(
    "UPDATE notification_push_deliveries SET status = 'pending'"
  ).run();
  expect(
    await repository.claimPendingDeliveries(
      [fixture.scheduleId],
      NOW.toISOString(),
      5
    )
  ).toEqual([]);
  await env.DB.prepare(
    "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = ?"
  )
    .bind(NOW.toISOString())
    .run();
  await retry.retryDueDeliveries(new Date(NOW.getTime() + 60_000));
  expect(sendNotificationToToken).not.toHaveBeenCalled();
  expect(
    await getDelivery(fixture.delivery.notification_push_delivery_id)
  ).toMatchObject({ status: 'failed' });
});

it.each(['deactivated', 'deleting', 'tokenOwnerChanged'] as const)(
  '%sの配信先をFCM直前に除外する',
  async mode => {
    const fixture = await createDeliveryFixture();
    if (mode === 'deactivated')
      await env.DB.prepare(
        'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
      )
        .bind(fixture.userId)
        .run();
    if (mode === 'deleting')
      await env.DB.prepare(
        "UPDATE users SET deletion_status = 'deletion_pending' WHERE user_id = ?"
      )
        .bind(fixture.userId)
        .run();
    if (mode === 'tokenOwnerChanged') {
      const other = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('別利用者') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare(
        'UPDATE firebase_tokens SET user_id = ? WHERE firebase_token_id = ?'
      )
        .bind(other!.user_id, fixture.tokenId)
        .run();
    }
    expect(
      await repository.renewDeliveryLease(
        fixture.delivery.notification_push_delivery_id,
        1,
        NOW.toISOString(),
        new Date(NOW.getTime() - 120_000).toISOString()
      )
    ).toBe(false);
  }
);
