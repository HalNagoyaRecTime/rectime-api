import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationPushDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationPushDeliveryRepository';

interface Fixture {
  scheduleId: number;
  tokenUserId: number;
  noTokenUserId: number;
}

async function createFixture(): Promise<Fixture> {
  const tokenUser = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('Token利用者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const noTokenUser = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('Tokenなし利用者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body) VALUES ('event_reminder', '集合通知', '集合してください') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  const schedule = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, importance, send_at, send_status, recipients_resolved_at) VALUES (?, 3, '2026-09-21T09:00:00.000Z', 'resolving', '2026-09-21T08:59:00.000Z') RETURNING notification_schedule_id"
  )
    .bind(notification!.notification_id)
    .first<{ notification_schedule_id: number }>();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'ios-token')"
    ).bind(tokenUser!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'android-token')"
    ).bind(tokenUser!.user_id),
    env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?)'
    ).bind(schedule!.notification_schedule_id, tokenUser!.user_id),
    env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?)'
    ).bind(schedule!.notification_schedule_id, noTokenUser!.user_id),
  ]);

  return {
    scheduleId: schedule!.notification_schedule_id,
    tokenUserId: tokenUser!.user_id,
    noTokenUserId: noTokenUser!.user_id,
  };
}

describe('NotificationPushDeliveryRepository', () => {
  const repository = createNotificationPushDeliveryRepository(env.DB);

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

  it('Token数分のpending Deliveryを生成し、TokenなしRecipientには作らない', async () => {
    const fixture = await createFixture();

    await expect(
      repository.isDeliveryGenerationAllowed(fixture.scheduleId)
    ).resolves.toBe(true);
    await expect(
      repository.createPendingDeliveries(fixture.scheduleId)
    ).resolves.toBe(2);
    await expect(
      repository.createPendingDeliveries(fixture.scheduleId)
    ).resolves.toBe(0);

    await expect(
      env.DB.prepare(
        'SELECT platform, status, attempt_count, first_attempt_at, last_attempt_at, next_retry_at, failed_reason, fcm_message_id, sent_at FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id WHERE r.notification_schedule_id = ? ORDER BY platform'
      )
        .bind(fixture.scheduleId)
        .all()
    ).resolves.toMatchObject({
      results: [
        {
          platform: 1,
          status: 'pending',
          attempt_count: 0,
          first_attempt_at: null,
          last_attempt_at: null,
          next_retry_at: null,
          failed_reason: null,
          fcm_message_id: null,
          sent_at: null,
        },
        {
          platform: 2,
          status: 'pending',
          attempt_count: 0,
          first_attempt_at: null,
          last_attempt_at: null,
          next_retry_at: null,
          failed_reason: null,
          fcm_message_id: null,
          sent_at: null,
        },
      ],
    });
  });

  it('Delivery生成後はScheduleをsendingへ進め、再生成条件を満たさない', async () => {
    const fixture = await createFixture();
    await repository.createPendingDeliveries(fixture.scheduleId);

    await expect(
      repository.markScheduleSending(
        fixture.scheduleId,
        '2026-09-21T09:00:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      repository.markScheduleSending(
        fixture.scheduleId,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe(false);
    await expect(
      repository.isDeliveryGenerationAllowed(fixture.scheduleId)
    ).resolves.toBe(false);
  });

  it('Delivery 0件でもsendingからcompletedへ進める', async () => {
    const fixture = await createFixture();
    await env.DB.prepare('DELETE FROM firebase_tokens').run();

    await expect(
      repository.createPendingDeliveries(fixture.scheduleId)
    ).resolves.toBe(0);
    await repository.markScheduleSending(
      fixture.scheduleId,
      '2026-09-21T09:00:00.000Z'
    );
    await expect(
      repository.completeScheduleIfIdle(
        fixture.scheduleId,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      env.DB.prepare(
        'SELECT send_status, completed_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toEqual({
      send_status: 'completed',
      completed_at: '2026-09-21T09:01:00.000Z',
    });
  });

  it('条件付きclaimでattemptと時刻を更新し、二重claimを拒否する', async () => {
    const fixture = await createFixture();
    await repository.createPendingDeliveries(fixture.scheduleId);

    const delivery = await env.DB.prepare(
      'SELECT d.notification_push_delivery_id FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id WHERE r.notification_schedule_id = ? ORDER BY d.notification_push_delivery_id LIMIT 1'
    )
      .bind(fixture.scheduleId)
      .first<{ notification_push_delivery_id: number }>();
    const claimed = await repository.claimPendingDelivery(
      delivery!.notification_push_delivery_id,
      '2026-09-21T09:00:00.000Z'
    );
    expect(claimed).toMatchObject({
      deliveryId: delivery!.notification_push_delivery_id,
      scheduleId: fixture.scheduleId,
      fcmToken: 'ios-token',
      platform: 1,
    });
    await expect(
      repository.claimPendingDelivery(
        delivery!.notification_push_delivery_id,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBeNull();

    await expect(
      env.DB.prepare(
        'SELECT status, attempt_count, first_attempt_at, last_attempt_at FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(delivery!.notification_push_delivery_id)
        .first()
    ).resolves.toEqual({
      status: 'sending',
      attempt_count: 1,
      first_attempt_at: '2026-09-21T09:00:00.000Z',
      last_attempt_at: '2026-09-21T09:00:00.000Z',
    });
  });

  it('firebase_token_idがNULLのDeliveryはclaimしない', async () => {
    const fixture = await createFixture();
    const recipient = await env.DB.prepare(
      'SELECT notification_recipient_id FROM notification_recipients WHERE notification_schedule_id = ? AND user_id = ?'
    )
      .bind(fixture.scheduleId, fixture.noTokenUserId)
      .first<{ notification_recipient_id: number }>();
    const delivery = await env.DB.prepare(
      "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status) VALUES (?, NULL, 2, 'pending') RETURNING notification_push_delivery_id"
    )
      .bind(recipient!.notification_recipient_id)
      .first<{ notification_push_delivery_id: number }>();

    await expect(
      repository.claimPendingDelivery(
        delivery!.notification_push_delivery_id,
        '2026-09-21T09:00:00.000Z'
      )
    ).resolves.toBeNull();
  });

  it('pendingまたはsendingが残る間は完了せず、sent/failedだけでcompletedにする', async () => {
    const fixture = await createFixture();
    await repository.createPendingDeliveries(fixture.scheduleId);
    await repository.markScheduleSending(
      fixture.scheduleId,
      '2026-09-21T09:00:00.000Z'
    );

    const deliveries = await env.DB.prepare(
      'SELECT d.notification_push_delivery_id FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id WHERE r.notification_schedule_id = ? ORDER BY d.notification_push_delivery_id'
    )
      .bind(fixture.scheduleId)
      .all<{ notification_push_delivery_id: number }>();
    const first = deliveries.results[0]!.notification_push_delivery_id;
    const second = deliveries.results[1]!.notification_push_delivery_id;

    await repository.claimPendingDelivery(first, '2026-09-21T09:01:00.000Z');
    await expect(
      repository.completeScheduleIfIdle(
        fixture.scheduleId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBe(false);
    await repository.markDeliverySent(
      first,
      'message-1',
      '2026-09-21T09:03:00.000Z'
    );
    await repository.claimPendingDelivery(second, '2026-09-21T09:04:00.000Z');
    await repository.markDeliveryFailed(
      second,
      'FCM unavailable',
      '2026-09-21T09:05:00.000Z'
    );
    await expect(
      repository.completeScheduleIfIdle(
        fixture.scheduleId,
        '2026-09-21T09:06:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      env.DB.prepare(
        'SELECT send_status, completed_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toEqual({
      send_status: 'completed',
      completed_at: '2026-09-21T09:06:00.000Z',
    });
  });
});
