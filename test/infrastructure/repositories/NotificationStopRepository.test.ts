import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationPushDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationPushDeliveryRepository';
import { createNotificationStopRepository } from '../../../src/infrastructure/repositories/NotificationStopRepository';

interface Fixture {
  userId: number;
  scheduleId: number;
  tokenId: number;
  deliveryId: number;
}

async function createFixture(): Promise<Fixture> {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('Stop利用者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '停止テスト', '停止してください') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  const schedule = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, send_at, send_status, recipients_resolved_at) VALUES (?, '2026-09-21T09:00:00.000Z', 'sending', '2026-09-21T08:59:00.000Z') RETURNING notification_schedule_id"
  )
    .bind(notification!.notification_id)
    .first<{ notification_schedule_id: number }>();
  const token = await env.DB.prepare(
    "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'stop-token') RETURNING firebase_token_id"
  )
    .bind(user!.user_id)
    .first<{ firebase_token_id: number }>();
  const recipient = await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(schedule!.notification_schedule_id, user!.user_id)
    .first<{ notification_recipient_id: number }>();
  const delivery = await env.DB.prepare(
    "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status) VALUES (?, ?, 1, 'pending') RETURNING notification_push_delivery_id"
  )
    .bind(recipient!.notification_recipient_id, token!.firebase_token_id)
    .first<{ notification_push_delivery_id: number }>();

  return {
    userId: user!.user_id,
    scheduleId: schedule!.notification_schedule_id,
    tokenId: token!.firebase_token_id,
    deliveryId: delivery!.notification_push_delivery_id,
  };
}

describe('NotificationStopRepository', () => {
  const repository = createNotificationStopRepository(env.DB);
  const pushRepository = createNotificationPushDeliveryRepository(env.DB);

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

  it('sending Scheduleを監査情報付きで停止し、pending/retry_waitだけをstoppedにする', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = '2026-09-21T09:10:00.000Z' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.stopSchedule(
        fixture.scheduleId,
        fixture.userId,
        'manual',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe('stopped');
    await expect(
      env.DB.prepare(
        'SELECT send_status, stopped_at, stopped_by_user_id, reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toEqual({
      send_status: 'stopped',
      stopped_at: '2026-09-21T09:01:00.000Z',
      stopped_by_user_id: fixture.userId,
      reason: 'manual',
    });
    await expect(
      env.DB.prepare(
        'SELECT status, next_retry_at FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(fixture.deliveryId)
        .first()
    ).resolves.toEqual({ status: 'stopped', next_retry_at: null });
    await expect(
      pushRepository.claimPendingDelivery(
        fixture.deliveryId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBeNull();
  });

  it('sending中のDeliveryはStop後もFCM応答をsentとして保存できる', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'sending' WHERE notification_push_delivery_id = ?"
    )
      .bind(fixture.deliveryId)
      .run();

    await expect(
      repository.stopSchedule(
        fixture.scheduleId,
        fixture.userId,
        'manual',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe('stopped');
    await expect(
      pushRepository.markDeliverySent(
        fixture.deliveryId,
        'message-after-stop',
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      env.DB.prepare(
        'SELECT status, fcm_message_id FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(fixture.deliveryId)
        .first()
    ).resolves.toEqual({
      status: 'sent',
      fcm_message_id: 'message-after-stop',
    });
  });

  it.each([
    'scheduled',
    'resolving',
    'completed',
    'failed',
    'stopped',
  ] as const)('%s ScheduleはStopできない', async status => {
    const fixture = await createFixture();
    await env.DB.prepare(
      'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
    )
      .bind(status, fixture.scheduleId)
      .run();

    await expect(
      repository.stopSchedule(
        fixture.scheduleId,
        fixture.userId,
        'manual',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe('not_allowed');
  });

  it('存在しないScheduleはnot_found、source_deletedはUser NULLで停止する', async () => {
    await expect(
      repository.stopSchedule(
        999999,
        null,
        'source_deleted',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe('not_found');

    const fixture = await createFixture();
    await expect(
      repository.stopSchedule(
        fixture.scheduleId,
        null,
        'source_deleted',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe('stopped');
    await expect(
      env.DB.prepare(
        'SELECT stopped_by_user_id, reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toEqual({
      stopped_by_user_id: null,
      reason: 'source_deleted',
    });
  });
});
