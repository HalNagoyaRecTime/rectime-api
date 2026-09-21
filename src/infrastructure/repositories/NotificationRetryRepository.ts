import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationRetryRepository } from '../../domain/interfaces/repositories/INotificationRetryRepository';
import type { NotificationPushDeliverySendTarget } from '../../domain/interfaces/repositories/INotificationPushDeliveryRepository';

const DELIVERY_TARGET_SELECT =
  'SELECT d.notification_push_delivery_id AS delivery_id, s.notification_schedule_id AS schedule_id, s.notification_id, s.event_id, n.notification_type, n.title, n.body, s.importance, d.firebase_token_id, ft.fcm_token, d.platform, d.attempt_count FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id INNER JOIN notifications n ON n.notification_id = s.notification_id INNER JOIN firebase_tokens ft ON ft.firebase_token_id = d.firebase_token_id WHERE d.notification_push_delivery_id = ?';

type DeliveryRow = {
  delivery_id: number;
  schedule_id: number;
  notification_id: number;
  event_id: number | null;
  notification_type: string;
  title: string;
  body: string;
  importance: number;
  firebase_token_id: number;
  fcm_token: string;
  platform: number;
  attempt_count: number;
};

export function createNotificationRetryRepository(
  db: D1Database
): INotificationRetryRepository {
  return {
    async isScheduleStopped(scheduleId) {
      const row = await db
        .prepare(
          "SELECT 1 AS stopped FROM notification_schedules WHERE notification_schedule_id = ? AND send_status = 'stopped'"
        )
        .bind(scheduleId)
        .first<{ stopped: number }>();
      return row?.stopped === 1;
    },

    async findRetryableDeliveryIds(now, limit) {
      const rows = await db
        .prepare(
          "SELECT d.notification_push_delivery_id AS delivery_id FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id WHERE d.status = 'retry_wait' AND d.firebase_token_id IS NOT NULL AND datetime(d.next_retry_at) <= datetime(?) AND s.send_status <> 'stopped' ORDER BY d.next_retry_at, d.notification_push_delivery_id LIMIT ?"
        )
        .bind(now, limit)
        .all<{ delivery_id: number }>();
      return rows.results.map(row => row.delivery_id);
    },

    async claimRetryableDelivery(deliveryId, now) {
      const claim = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'sending', first_attempt_at = COALESCE(first_attempt_at, ?), last_attempt_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'retry_wait' AND firebase_token_id IS NOT NULL AND datetime(next_retry_at) <= datetime(?) AND EXISTS (SELECT 1 FROM notification_recipients r INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status <> 'stopped')"
        )
        .bind(now, now, now, deliveryId, now)
        .run();
      if (claim.meta.changes !== 1) return null;
      return selectDeliveryTarget(db, deliveryId);
    },

    async findTimedOutDeliveryIds(staleBefore, limit) {
      const rows = await db
        .prepare(
          "SELECT d.notification_push_delivery_id AS delivery_id FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id WHERE d.status = 'sending' AND d.firebase_token_id IS NOT NULL AND datetime(d.last_attempt_at) <= datetime(?) AND s.send_status <> 'stopped' ORDER BY d.last_attempt_at, d.notification_push_delivery_id LIMIT ?"
        )
        .bind(staleBefore, limit)
        .all<{ delivery_id: number }>();
      return rows.results.map(row => row.delivery_id);
    },

    async claimTimedOutDelivery(deliveryId, staleBefore, now) {
      const claim = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'sending', first_attempt_at = COALESCE(first_attempt_at, ?), last_attempt_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'sending' AND firebase_token_id IS NOT NULL AND datetime(last_attempt_at) <= datetime(?) AND EXISTS (SELECT 1 FROM notification_recipients r INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status <> 'stopped')"
        )
        .bind(now, now, now, deliveryId, staleBefore)
        .run();
      if (claim.meta.changes !== 1) return null;
      return selectDeliveryTarget(db, deliveryId);
    },

    async scheduleRetry(deliveryId, nextRetryAt, reason, now) {
      const result = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = ?, failed_reason = ?, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'sending' AND EXISTS (SELECT 1 FROM notification_recipients r INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status <> 'stopped')"
        )
        .bind(nextRetryAt, reason, now, deliveryId)
        .run();
      return result.meta.changes === 1;
    },

    async markDeliveryFailed(deliveryId, reason, now) {
      const result = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'failed', failed_reason = ?, sent_at = NULL, next_retry_at = NULL, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'sending'"
        )
        .bind(reason, now, deliveryId)
        .run();
      return result.meta.changes === 1;
    },

    async deleteFirebaseToken(firebaseTokenId) {
      await db
        .prepare('DELETE FROM firebase_tokens WHERE firebase_token_id = ?')
        .bind(firebaseTokenId)
        .run();
    },

    async markDeliverySent(deliveryId, messageId, now) {
      const result = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'sent', fcm_message_id = ?, sent_at = ?, failed_reason = NULL, next_retry_at = NULL, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'sending'"
        )
        .bind(messageId, now, now, deliveryId)
        .run();
      return result.meta.changes === 1;
    },

    async completeScheduleIfIdle(scheduleId, now) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET send_status = 'completed', completed_at = ?, updated_at = ? WHERE notification_schedule_id = ? AND send_status = 'sending' AND recipients_resolved_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id WHERE r.notification_schedule_id = ? AND d.status IN ('pending', 'sending', 'retry_wait'))"
        )
        .bind(now, now, scheduleId, scheduleId)
        .run();
      return result.meta.changes === 1;
    },
  };
}

async function selectDeliveryTarget(
  db: D1Database,
  deliveryId: number
): Promise<NotificationPushDeliverySendTarget | null> {
  const row = await db
    .prepare(DELIVERY_TARGET_SELECT)
    .bind(deliveryId)
    .first<DeliveryRow>();
  if (!row) return null;
  if (row.platform !== 1 && row.platform !== 2) {
    throw new Error('Unsupported Firebase platform: ' + row.platform);
  }
  return {
    deliveryId: row.delivery_id,
    scheduleId: row.schedule_id,
    notificationId: row.notification_id,
    eventId: row.event_id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    importance: row.importance,
    firebaseTokenId: row.firebase_token_id,
    fcmToken: row.fcm_token,
    platform: row.platform,
    attemptCount: row.attempt_count,
  };
}
