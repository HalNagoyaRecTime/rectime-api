import { env } from 'cloudflare:workers';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';

export const NOW = new Date('2026-09-24T12:00:00.000Z');

export async function clearNotificationFixtures(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM notification_schedules
       WHERE notification_id IN (
         SELECT notification_id FROM notifications
         WHERE created_by_user_id IN (
           SELECT user_id FROM users WHERE user_name = 'ScheduleAction actor'
         )
       )`
    ),
    env.DB.prepare(
      `DELETE FROM notifications WHERE created_by_user_id IN (
         SELECT user_id FROM users WHERE user_name = 'ScheduleAction actor'
       )`
    ),
    env.DB.prepare(
      `DELETE FROM firebase_tokens WHERE user_id IN (
         SELECT user_id FROM users WHERE user_name = 'ScheduleAction actor'
       )`
    ),
    env.DB.prepare(
      `DELETE FROM staffs WHERE user_id IN (
         SELECT user_id FROM users WHERE user_name = 'ScheduleAction actor'
       )`
    ),
    env.DB.prepare(
      "DELETE FROM users WHERE user_name IN ('ScheduleAction actor', '再送時に追加されたUser')"
    ),
    env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = 999001'),
    env.DB.prepare(
      'DELETE FROM gathering_spots WHERE gathering_spot_id = 999001'
    ),
    env.DB.prepare('DELETE FROM events WHERE event_id = 999001'),
    env.DB.prepare("DELETE FROM events WHERE event_name = 'Legacy field test'"),
  ]);
}

export async function createDeliveryFixture(): Promise<{
  userId: number;
  notificationId: number;
  scheduleId: number;
  delivery: { notification_push_delivery_id: number };
}> {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('ScheduleAction actor', 1) RETURNING user_id"
  ).first<{ user_id: number }>();
  if (!user) throw new Error('ScheduleAction用Userを作成できませんでした');

  const result = await createAdminNotificationCommandRepository(env.DB).create({
    actor_user_id: user.user_id,
    push_title: '再送テスト',
    push_body: '本文',
    detail_title: '詳細',
    detail_body: '詳細本文',
    importance: 'normal',
    send_at: NOW.toISOString(),
    audiences: [{ type: 'user', target_id: user.user_id }],
    now: NOW.toISOString(),
  });
  const recipient = await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(result.notification_schedule_id, user.user_id)
    .first<{ notification_recipient_id: number }>();
  if (!recipient)
    throw new Error('ScheduleAction用Recipientを作成できませんでした');

  const delivery = await env.DB.prepare(
    `INSERT INTO notification_push_deliveries
      (notification_recipient_id, platform, status, attempt_count, first_attempt_at, last_attempt_at)
     VALUES (?, 1, 'sending', 1, ?, ?) RETURNING notification_push_delivery_id`
  )
    .bind(
      recipient.notification_recipient_id,
      NOW.toISOString(),
      NOW.toISOString()
    )
    .first<{ notification_push_delivery_id: number }>();
  if (!delivery)
    throw new Error('ScheduleAction用Deliveryを作成できませんでした');

  await env.DB.prepare(
    `UPDATE notification_schedules
     SET send_status = 'sending', recipients_resolved_at = ?, started_at = ?
     WHERE notification_schedule_id = ?`
  )
    .bind(NOW.toISOString(), NOW.toISOString(), result.notification_schedule_id)
    .run();

  return {
    userId: user.user_id,
    notificationId: result.notification_id,
    scheduleId: result.notification_schedule_id,
    delivery,
  };
}

export async function getDelivery(id: number) {
  return env.DB.prepare(
    'SELECT status, attempt_count FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
  )
    .bind(id)
    .first<{ status: string; attempt_count: number }>();
}
