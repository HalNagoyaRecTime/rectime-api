import { env } from 'cloudflare:workers';
import { createAdminNotificationCommandRepository } from '../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationAudienceResolverService } from '../src/application/services/NotificationAudienceResolverService';
import { createNotificationDeliveryRepository } from '../src/infrastructure/repositories/NotificationDeliveryRepository';
import { createFirebaseTokenRepository } from '../src/infrastructure/repositories/FirebaseTokenRepository';

export const NOW = new Date('2026-10-03T00:00:00.000Z');
export const repository = createNotificationDeliveryRepository(env.DB);
export const tokens = createFirebaseTokenRepository(env.DB);

export async function clearNotificationFixtures() {
  await env.DB.batch(
    [
      'notification_push_deliveries',
      'notification_recipients',
      'notification_audiences',
      'notification_schedules',
      'notifications',
      'firebase_tokens',
      'gathering_group_members',
      'gatherings',
      'gathering_spots',
      'students',
      'staffs',
      'teachers',
      'events',
      'users',
    ].map(table => env.DB.prepare(`DELETE FROM ${table}`))
  );
}

export async function createDeliveryFixture() {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('通知操作テスト') RETURNING user_id"
  ).first<{ user_id: number }>();
  if (!user) throw new Error('Userの作成に失敗しました');
  const token = await env.DB.prepare(
    "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'notification-fixture-token') RETURNING firebase_token_id"
  )
    .bind(user.user_id)
    .first<{ firebase_token_id: number }>();
  if (!token) throw new Error('Tokenの作成に失敗しました');
  const created = await createAdminNotificationCommandRepository(env.DB).create(
    {
      actor_user_id: user.user_id,
      push_title: '通知テスト',
      push_body: '本文',
      detail_title: '詳細',
      detail_body: '詳細本文',
      importance: 'normal',
      send_at: NOW.toISOString(),
      audiences: [{ type: 'user', target_id: user.user_id }],
      now: NOW.toISOString(),
    }
  );
  const scheduleId = created.notification_schedule_id;
  await createNotificationAudienceResolverService(
    createNotificationAudienceResolverRepository(env.DB)
  ).resolveDueSchedules(NOW);
  await repository.prepareResolvedSchedule(scheduleId, NOW.toISOString());
  const [delivery] = await repository.claimPendingDeliveries(
    [scheduleId],
    NOW.toISOString(),
    10
  );
  if (!delivery) throw new Error('Deliveryをclaimできませんでした');
  return {
    delivery,
    scheduleId,
    notificationId: created.notification_id,
    userId: user.user_id,
    tokenId: token.firebase_token_id,
  };
}

export function getDelivery(deliveryId: number) {
  return env.DB.prepare(
    'SELECT * FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
  )
    .bind(deliveryId)
    .first<Record<string, unknown>>();
}
