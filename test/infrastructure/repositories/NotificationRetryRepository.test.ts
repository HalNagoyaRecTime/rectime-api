import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationRetryRepository } from '../../../src/infrastructure/repositories/NotificationRetryRepository';

interface Fixture {
  scheduleId: number;
  tokenId: number;
  deliveryId: number;
}

async function createFixture(): Promise<Fixture> {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('Retry利用者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body) VALUES ('event_reminder', '集合通知', '集合してください') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  const schedule = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, importance, send_at, send_status, recipients_resolved_at) VALUES (?, 3, '2026-09-21T09:00:00.000Z', 'sending', '2026-09-21T08:59:00.000Z') RETURNING notification_schedule_id"
  )
    .bind(notification!.notification_id)
    .first<{ notification_schedule_id: number }>();
  const token = await env.DB.prepare(
    "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'retry-token') RETURNING firebase_token_id"
  )
    .bind(user!.user_id)
    .first<{ firebase_token_id: number }>();
  const recipient = await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(schedule!.notification_schedule_id, user!.user_id)
    .first<{ notification_recipient_id: number }>();
  const delivery = await env.DB.prepare(
    "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count) VALUES (?, ?, 1, 'sending', 1) RETURNING notification_push_delivery_id"
  )
    .bind(recipient!.notification_recipient_id, token!.firebase_token_id)
    .first<{ notification_push_delivery_id: number }>();

  return {
    scheduleId: schedule!.notification_schedule_id,
    tokenId: token!.firebase_token_id,
    deliveryId: delivery!.notification_push_delivery_id,
  };
}

describe('NotificationRetryRepository', () => {
  const repository = createNotificationRetryRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_audiences'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('retry_waitを条件付きclaimし、attempt_countを増やす', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = '2026-09-21T09:00:00.000Z' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.findRetryableDeliveryIds('2026-09-21T09:01:00.000Z', 100)
    ).resolves.toEqual([fixture.deliveryId]);

    await expect(
      repository.claimRetryableDelivery(
        fixture.deliveryId,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toMatchObject({
      deliveryId: fixture.deliveryId,
      scheduleId: fixture.scheduleId,
      firebaseTokenId: fixture.tokenId,
      fcmToken: 'retry-token',
      attemptCount: 2,
    });
    await expect(
      repository.claimRetryableDelivery(
        fixture.deliveryId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBeNull();
  });

  it('processing timeoutは境界時刻を含めてclaimする', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET last_attempt_at = '2026-09-21T08:58:00.000Z' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.findTimedOutDeliveryIds('2026-09-21T09:00:00.000Z', 100)
    ).resolves.toEqual([fixture.deliveryId]);
    await expect(
      repository.claimTimedOutDelivery(
        fixture.deliveryId,
        '2026-09-21T09:00:00.000Z',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toMatchObject({ attemptCount: 2 });
  });

  it('停止ScheduleのRetryをclaimせず、retry更新も拒否する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'stopped' WHERE notification_schedule_id = ?"
    )
      .bind(fixture.scheduleId)
      .run();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = '2026-09-21T09:00:00.000Z' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.isScheduleStopped(fixture.scheduleId)
    ).resolves.toBe(true);
    await expect(
      repository.findRetryableDeliveryIds('2026-09-21T09:01:00.000Z', 100)
    ).resolves.toEqual([]);
    await expect(
      repository.claimRetryableDelivery(
        fixture.deliveryId,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBeNull();
  });

  it('Token削除後もDeliveryをfailedにでき、failedだけでScheduleを完了できる', async () => {
    const fixture = await createFixture();
    await repository.deleteFirebaseToken(fixture.tokenId);
    await expect(
      env.DB.prepare(
        'SELECT firebase_token_id FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(fixture.deliveryId)
        .first()
    ).resolves.toEqual({ firebase_token_id: null });

    await expect(
      repository.markDeliveryFailed(
        fixture.deliveryId,
        'UNREGISTERED',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      repository.completeScheduleIfIdle(
        fixture.scheduleId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBe(true);
  });

  it('retry_waitが残る間はScheduleを完了しない', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = '2026-09-21T09:10:00.000Z' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.completeScheduleIfIdle(
        fixture.scheduleId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBe(false);
    await expect(
      repository.scheduleRetry(
        fixture.deliveryId,
        '2026-09-21T09:20:00.000Z',
        'FCM unavailable',
        '2026-09-21T09:03:00.000Z'
      )
    ).resolves.toBe(false);
  });
});
