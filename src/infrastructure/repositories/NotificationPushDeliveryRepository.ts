import type { D1Database } from '@cloudflare/workers-types';
import type {
  INotificationPushDeliveryRepository,
  NotificationPushDeliverySendTarget,
} from '../../domain/interfaces/repositories/INotificationPushDeliveryRepository';

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
};

export function createNotificationPushDeliveryRepository(
  db: D1Database
): INotificationPushDeliveryRepository {
  return {
    async isDeliveryGenerationAllowed(scheduleId) {
      const row = await db
        .prepare(
          "SELECT 1 AS allowed FROM notification_schedules WHERE notification_schedule_id = ? AND send_status = 'resolving' AND recipients_resolved_at IS NOT NULL"
        )
        .bind(scheduleId)
        .first<{ allowed: number }>();
      return row?.allowed === 1;
    },

    async createPendingDeliveries(scheduleId) {
      const result = await db
        .prepare(
          "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, first_attempt_at, last_attempt_at, next_retry_at, failed_reason, fcm_message_id, sent_at) SELECT r.notification_recipient_id, ft.firebase_token_id, ft.platform, 'pending', 0, NULL, NULL, NULL, NULL, NULL, NULL FROM notification_recipients r INNER JOIN firebase_tokens ft ON ft.user_id = r.user_id AND ft.is_firebase_active = 1 WHERE r.notification_schedule_id = ? ON CONFLICT DO NOTHING"
        )
        .bind(scheduleId)
        .run();
      return result.meta.changes;
    },

    async markScheduleSending(scheduleId, now) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET send_status = 'sending', updated_at = ? WHERE notification_schedule_id = ? AND send_status = 'resolving' AND recipients_resolved_at IS NOT NULL"
        )
        .bind(now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async claimPendingDelivery(deliveryId, now) {
      const claim = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'sending', first_attempt_at = COALESCE(first_attempt_at, ?), last_attempt_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'pending' AND firebase_token_id IS NOT NULL"
        )
        .bind(now, now, now, deliveryId)
        .run();
      if (claim.meta.changes !== 1) return null;

      const row = await db
        .prepare(
          'SELECT d.notification_push_delivery_id AS delivery_id, s.notification_schedule_id AS schedule_id, s.notification_id, s.event_id, n.notification_type, n.title, n.body, s.importance, d.firebase_token_id, ft.fcm_token, d.platform FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id INNER JOIN notification_schedules s ON s.notification_schedule_id = r.notification_schedule_id INNER JOIN notifications n ON n.notification_id = s.notification_id INNER JOIN firebase_tokens ft ON ft.firebase_token_id = d.firebase_token_id WHERE d.notification_push_delivery_id = ?'
        )
        .bind(deliveryId)
        .first<DeliveryRow>();
      return row ? toSendTarget(row) : null;
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

    async markDeliveryFailed(deliveryId, reason, now) {
      const result = await db
        .prepare(
          "UPDATE notification_push_deliveries SET status = 'failed', fcm_message_id = NULL, failed_reason = ?, sent_at = NULL, next_retry_at = NULL, updated_at = ? WHERE notification_push_delivery_id = ? AND status = 'sending'"
        )
        .bind(reason, now, deliveryId)
        .run();
      return result.meta.changes === 1;
    },

    async completeScheduleIfIdle(scheduleId, now) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET send_status = 'completed', completed_at = ?, updated_at = ? WHERE notification_schedule_id = ? AND send_status = 'sending' AND recipients_resolved_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM notification_push_deliveries d INNER JOIN notification_recipients r ON r.notification_recipient_id = d.notification_recipient_id WHERE r.notification_schedule_id = ? AND d.status IN ('pending', 'sending'))"
        )
        .bind(now, now, scheduleId, scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async markScheduleFailed(scheduleId, reason, now) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET send_status = 'failed', failed_reason = ?, updated_at = ? WHERE notification_schedule_id = ? AND send_status IN ('resolving', 'sending')"
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },
  };
}

function toSendTarget(row: DeliveryRow): NotificationPushDeliverySendTarget {
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
  };
}
