import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';

interface CandidateRow {
  notification_schedule_id: number;
  send_status: string;
}

interface DeliveryIdRow {
  notification_push_delivery_id: number;
}

interface ClaimedDeliveryRow extends DeliveryIdRow {
  notification_schedule_id: number;
  notification_id: number;
  firebase_token_id: number;
  fcm_token: string;
  platform: number;
  push_title: string;
  push_body: string;
  importance: string;
}

interface CountRow {
  delivery_count: number;
}

export function createNotificationDeliveryRepository(
  db: D1Database
): INotificationDeliveryRepository {
  return {
    async findReadySchedules(now, limit) {
      const rows = await db
        .prepare(
          `SELECT s.notification_schedule_id, s.send_status
           FROM notification_schedules s
           JOIN notifications n ON n.notification_id = s.notification_id
           WHERE n.notification_type = 'notification_general'
             AND datetime(s.send_at) <= datetime(?)
             AND (
               (s.send_status = 'resolving'
                AND s.recipients_resolved_at IS NOT NULL)
               OR (s.send_status = 'sending'
                   AND s.recipients_resolved_at IS NOT NULL
                   AND (
                     EXISTS (
                       SELECT 1 FROM notification_push_deliveries d
                       JOIN notification_recipients r
                         ON r.notification_recipient_id = d.notification_recipient_id
                       WHERE r.notification_schedule_id = s.notification_schedule_id
                         AND d.status = 'pending'
                     )
                     OR NOT EXISTS (
                       SELECT 1 FROM notification_push_deliveries d
                       JOIN notification_recipients r
                         ON r.notification_recipient_id = d.notification_recipient_id
                       WHERE r.notification_schedule_id = s.notification_schedule_id
                         AND d.status IN ('pending', 'sending')
                     )
                   ))
             )
           ORDER BY s.send_at, s.notification_schedule_id
           LIMIT ?`
        )
        .bind(now, limit)
        .all<CandidateRow>();
      return rows.results.map(row => ({
        notification_schedule_id: row.notification_schedule_id,
        send_status: row.send_status as 'resolving' | 'sending',
      }));
    },

    async prepareResolvedSchedule(scheduleId, now) {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO notification_push_deliveries (
               notification_recipient_id, firebase_token_id, platform, status,
               attempt_count, created_at, updated_at
             )
             SELECT r.notification_recipient_id, t.firebase_token_id, t.platform,
                    'pending', 0, ?, ?
             FROM notification_recipients r
             JOIN firebase_tokens t
               ON t.user_id = r.user_id
              AND t.is_firebase_active = 1
             WHERE r.notification_schedule_id = ?
               AND EXISTS (
                 SELECT 1 FROM notification_schedules s
                 WHERE s.notification_schedule_id = ?
                   AND s.send_status = 'resolving'
                   AND s.recipients_resolved_at IS NOT NULL
               )
             ON CONFLICT(notification_recipient_id, firebase_token_id)
               WHERE firebase_token_id IS NOT NULL DO NOTHING`
          )
          .bind(now, now, scheduleId, scheduleId),
        db
          .prepare(
            `UPDATE notification_schedules
             SET send_status = 'sending', updated_at = ?
             WHERE notification_schedule_id = ?
               AND send_status = 'resolving'
               AND recipients_resolved_at IS NOT NULL
               AND EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.notification_id = notification_schedules.notification_id
                   AND n.notification_type = 'notification_general'
               )`
          )
          .bind(now, scheduleId),
        db
          .prepare(
            `UPDATE notification_schedules
             SET send_status = 'completed',
                 completed_at = COALESCE(completed_at, ?),
                 updated_at = ?
             WHERE notification_schedule_id = ?
               AND send_status = 'sending'
               AND recipients_resolved_at IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM notification_push_deliveries d
                 JOIN notification_recipients r
                   ON r.notification_recipient_id = d.notification_recipient_id
                 WHERE r.notification_schedule_id = notification_schedules.notification_schedule_id
                   AND d.status IN ('pending', 'sending')
               )`
          )
          .bind(now, now, scheduleId),
      ]);
      return results[2]?.meta.changes === 1;
    },

    async countPendingDeliveries(scheduleId) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS delivery_count
           FROM notification_push_deliveries d
           JOIN notification_recipients r
             ON r.notification_recipient_id = d.notification_recipient_id
           WHERE r.notification_schedule_id = ?
             AND d.status = 'pending'
             AND d.firebase_token_id IS NOT NULL`
        )
        .bind(scheduleId)
        .first<CountRow>();
      return row?.delivery_count ?? 0;
    },

    async claimPendingDeliveries(scheduleIds, now, limit) {
      if (scheduleIds.length === 0) return [];
      const schedulePlaceholders = scheduleIds.map(() => '?').join(', ');
      const candidates = await db
        .prepare(
          `SELECT d.notification_push_delivery_id
           FROM notification_push_deliveries d
           JOIN notification_recipients r
             ON r.notification_recipient_id = d.notification_recipient_id
           JOIN notification_schedules s
             ON s.notification_schedule_id = r.notification_schedule_id
           JOIN notifications n ON n.notification_id = s.notification_id
           WHERE r.notification_schedule_id IN (${schedulePlaceholders})
             AND s.send_status = 'sending'
             AND n.notification_type = 'notification_general'
             AND d.status = 'pending'
             AND d.firebase_token_id IS NOT NULL
           ORDER BY d.notification_push_delivery_id
           LIMIT ?`
        )
        .bind(...scheduleIds, limit)
        .all<DeliveryIdRow>();
      if (candidates.results.length === 0) return [];

      const claimed = await db.batch(
        candidates.results.map(candidate =>
          db
            .prepare(
              `UPDATE notification_push_deliveries
               SET status = 'sending',
                   first_attempt_at = COALESCE(first_attempt_at, ?),
                   last_attempt_at = ?,
                   attempt_count = attempt_count + 1,
                   updated_at = ?
               WHERE notification_push_delivery_id = ?
                 AND status = 'pending'
                 AND firebase_token_id IS NOT NULL
                 AND EXISTS (
                   SELECT 1
                   FROM notification_recipients r
                   JOIN notification_schedules s
                     ON s.notification_schedule_id = r.notification_schedule_id
                   JOIN notifications n ON n.notification_id = s.notification_id
                   WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id
                     AND s.send_status = 'sending'
                     AND n.notification_type = 'notification_general'
                 )
               RETURNING notification_push_delivery_id`
            )
            .bind(now, now, now, candidate.notification_push_delivery_id)
        )
      );
      const claimedIds = claimed.flatMap(result =>
        result.results.map(
          row => (row as DeliveryIdRow).notification_push_delivery_id
        )
      );
      if (claimedIds.length === 0) return [];

      const claimedPlaceholders = claimedIds.map(() => '?').join(', ');
      const details = await db
        .prepare(
          `SELECT
             d.notification_push_delivery_id,
             r.notification_schedule_id,
             s.notification_id,
             d.firebase_token_id,
             t.fcm_token,
             d.platform,
             n.push_title,
             n.push_body,
             n.importance
           FROM notification_push_deliveries d
           JOIN notification_recipients r
             ON r.notification_recipient_id = d.notification_recipient_id
           JOIN notification_schedules s
             ON s.notification_schedule_id = r.notification_schedule_id
           JOIN notifications n ON n.notification_id = s.notification_id
           JOIN firebase_tokens t ON t.firebase_token_id = d.firebase_token_id
           WHERE d.notification_push_delivery_id IN (${claimedPlaceholders})
             AND d.status = 'sending'
             AND n.notification_type = 'notification_general'
           ORDER BY d.notification_push_delivery_id`
        )
        .bind(...claimedIds)
        .all<ClaimedDeliveryRow>();

      return details.results.map(row => {
        if (row.platform !== 1 && row.platform !== 2) {
          throw new Error(`不正なFirebase platformです: ${row.platform}`);
        }
        return {
          notification_push_delivery_id: row.notification_push_delivery_id,
          notification_schedule_id: row.notification_schedule_id,
          notification_id: row.notification_id,
          notification_type: 'notification_general' as const,
          firebase_token_id: row.firebase_token_id,
          fcm_token: row.fcm_token,
          platform: row.platform,
          push_title: row.push_title,
          push_body: row.push_body,
          importance: row.importance as 'low' | 'normal' | 'high',
        };
      });
    },

    async markSent(deliveryId, messageId, now) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
           SET status = 'sent',
               fcm_message_id = ?,
               sent_at = ?,
               failed_reason = NULL,
               next_retry_at = NULL,
               updated_at = ?
           WHERE notification_push_delivery_id = ?
             AND status = 'sending'`
        )
        .bind(messageId, now, now, deliveryId)
        .run();
      if (result.meta.changes !== 1) {
        throw new Error('送信済みDeliveryを保存できませんでした');
      }
    },

    async markFailed(deliveryId, reason, now) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
           SET status = 'failed',
               failed_reason = ?,
               sent_at = NULL,
               next_retry_at = NULL,
               updated_at = ?
           WHERE notification_push_delivery_id = ?
             AND status = 'sending'`
        )
        .bind(reason, now, deliveryId)
        .run();
      if (result.meta.changes !== 1) {
        throw new Error('失敗Deliveryを保存できませんでした');
      }
    },

    async completeScheduleIfDone(scheduleId, now) {
      const result = await db
        .prepare(
          `UPDATE notification_schedules
           SET send_status = 'completed',
               completed_at = COALESCE(completed_at, ?),
               updated_at = ?
           WHERE notification_schedule_id = ?
             AND send_status = 'sending'
             AND recipients_resolved_at IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM notification_push_deliveries d
               JOIN notification_recipients r
                 ON r.notification_recipient_id = d.notification_recipient_id
               WHERE r.notification_schedule_id = notification_schedules.notification_schedule_id
                 AND d.status IN ('pending', 'sending')
             )`
        )
        .bind(now, now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async markScheduleFailed(scheduleId, reason, now) {
      const result = await db
        .prepare(
          `UPDATE notification_schedules
           SET send_status = 'failed', failed_reason = ?, updated_at = ?
           WHERE notification_schedule_id = ?
             AND send_status = 'resolving'
             AND recipients_resolved_at IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.notification_id = notification_schedules.notification_id
                 AND n.notification_type = 'notification_general'
             )`
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },
  };
}
