import type { D1Database } from '@cloudflare/workers-types';
import type { ClaimedNotificationPushDelivery } from '../../domain/entities/NotificationDelivery';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';

interface CandidateRow {
  notification_schedule_id: number;
  send_status: string;
}

interface DeliveryIdRow {
  notification_push_delivery_id: number;
}

interface ClaimedDeliveryRow extends DeliveryIdRow {
  attempt_count: number;
  first_attempt_at: string;
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
                         AND d.status IN ('pending', 'sending', 'retry_wait')
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
                   AND d.status IN ('pending', 'sending', 'retry_wait')
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

    async markPendingDeliveriesWithoutTokenFailed(scheduleId, reason, now) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
           SET status = 'failed',
               failed_reason = ?,
               sent_at = NULL,
               next_retry_at = NULL,
               updated_at = ?
           WHERE status = 'pending'
             AND firebase_token_id IS NULL
             AND notification_recipient_id IN (
               SELECT notification_recipient_id
               FROM notification_recipients
               WHERE notification_schedule_id = ?
             )`
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes;
    },

    async claimPendingDeliveries(scheduleIds, now, limit) {
      return claimDeliveries(db, scheduleIds, now, limit);
    },
    async claimRetryDeliveries(now, staleBefore, limit) {
      return claimDeliveries(db, null, now, limit, staleBefore);
    },
    async retireUnsendableDeliveries(now, staleBefore, maxAttempts) {
      const retired = await db
        .prepare(
          `UPDATE notification_push_deliveries
        SET status = CASE WHEN EXISTS (
          SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
          WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'stopped'
        ) THEN 'stopped' ELSE 'failed' END,
        failed_reason = '再送対象のTokenがないか試行上限に到達しました', next_retry_at = NULL, updated_at = ?
        WHERE (status IN ('pending', 'retry_wait') OR (status = 'sending' AND julianday(last_attempt_at) < julianday(?)))
          AND (firebase_token_id IS NULL OR attempt_count >= ? OR EXISTS (
            SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
            WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'stopped'
          ) OR (status IN ('retry_wait', 'sending') AND first_attempt_at IS NOT NULL
            AND julianday(first_attempt_at, '+900 seconds') < julianday(?)))
        RETURNING (SELECT notification_schedule_id FROM notification_recipients r
          WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id) AS notification_schedule_id`
        )
        .bind(now, staleBefore, maxAttempts, now)
        .all<{ notification_schedule_id: number }>();
      return [
        ...new Set(retired.results.map(row => row.notification_schedule_id)),
      ];
    },
    async saveRetry(deliveryId, attemptCount, reason, nextRetryAt, now) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
        SET status = CASE
          WHEN EXISTS (SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
            WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'stopped') THEN 'stopped'
          WHEN firebase_token_id IS NULL THEN 'failed'
          ELSE 'retry_wait' END,
          failed_reason = ?, next_retry_at = CASE WHEN firebase_token_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
            WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'sending'
          ) THEN ? ELSE NULL END, updated_at = ?
        WHERE notification_push_delivery_id = ? AND status = 'sending' AND attempt_count = ?
        RETURNING status`
        )
        .bind(reason, nextRetryAt, now, deliveryId, attemptCount)
        .first<{ status: 'retry_wait' | 'stopped' | 'failed' }>();
      return result?.status ?? 'superseded';
    },

    async markSent(deliveryId, messageId, now, attemptCount) {
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
             AND status = 'sending' AND (? IS NULL OR attempt_count = ?)`
        )
        .bind(
          messageId,
          now,
          now,
          deliveryId,
          attemptCount ?? null,
          attemptCount ?? null
        )
        .run();
      return result.meta.changes === 1;
    },

    async markFailed(deliveryId, reason, now, attemptCount) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
           SET status = 'failed',
               failed_reason = ?,
               sent_at = NULL,
               next_retry_at = NULL,
               updated_at = ?
           WHERE notification_push_delivery_id = ?
             AND status = 'sending' AND (? IS NULL OR attempt_count = ?)`
        )
        .bind(
          reason,
          now,
          deliveryId,
          attemptCount ?? null,
          attemptCount ?? null
        )
        .run();
      return result.meta.changes === 1;
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
                 AND d.status IN ('pending', 'sending', 'retry_wait')
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
           SET send_status = 'failed', reason = ?, updated_at = ?
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

async function claimDeliveries(
  db: D1Database,
  scheduleIds: number[] | null,
  now: string,
  limit: number,
  staleBefore?: string
): Promise<ClaimedNotificationPushDelivery[]> {
  if (scheduleIds?.length === 0) return [];
  const schedulePlaceholders = scheduleIds?.map(() => '?').join(', ');
  const eligible =
    staleBefore === undefined
      ? "status = 'pending'"
      : "attempt_count < 6 AND first_attempt_at IS NOT NULL AND julianday(first_attempt_at, '+900 seconds') >= julianday(?) AND ((status = 'retry_wait' AND julianday(next_retry_at) <= julianday(?)) OR (status = 'sending' AND julianday(last_attempt_at) < julianday(?)))";
  const eligibilityBindings =
    staleBefore === undefined ? [] : [now, now, staleBefore];
  const qualifiedEligible = eligible.replace(
    /\b(status|attempt_count|next_retry_at|last_attempt_at)\b/g,
    'd.$1'
  );
  const candidates = await db
    .prepare(
      `SELECT d.notification_push_delivery_id
           FROM notification_push_deliveries d
           JOIN notification_recipients r
             ON r.notification_recipient_id = d.notification_recipient_id
           JOIN notification_schedules s
             ON s.notification_schedule_id = r.notification_schedule_id
           JOIN notifications n ON n.notification_id = s.notification_id
           ${scheduleIds ? `WHERE r.notification_schedule_id IN (${schedulePlaceholders})` : `WHERE 1 = 1`}
             AND s.send_status = 'sending'
             AND n.notification_type = 'notification_general'
             AND ${qualifiedEligible}
             AND d.firebase_token_id IS NOT NULL
           ORDER BY d.notification_push_delivery_id
           LIMIT ?`
    )
    .bind(...(scheduleIds ?? []), ...eligibilityBindings, limit)
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
                   next_retry_at = NULL, failed_reason = NULL,
                   updated_at = ?
               WHERE notification_push_delivery_id = ?
                 AND ${eligible}
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
        .bind(
          now,
          now,
          now,
          candidate.notification_push_delivery_id,
          ...eligibilityBindings
        )
    )
  );
  const claimedIds = claimed.flatMap(result =>
    result.results.map(
      row => (row as DeliveryIdRow).notification_push_delivery_id
    )
  );
  if (claimedIds.length === 0) return [];

  const rows: ClaimedDeliveryRow[] = [];
  // D1のbind上限100個のうち、取得時刻に1個を使用する。
  for (let offset = 0; offset < claimedIds.length; offset += 99) {
    const detailIds = claimedIds.slice(offset, offset + 99);
    const claimedPlaceholders = detailIds.map(() => '?').join(', ');
    const details = await db
      .prepare(
        `SELECT
             d.notification_push_delivery_id, d.attempt_count,
             d.first_attempt_at,
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
             AND d.status = 'sending' AND d.last_attempt_at = ?
             AND n.notification_type = 'notification_general'
           ORDER BY d.notification_push_delivery_id`
      )
      .bind(...detailIds, now)
      .all<ClaimedDeliveryRow>();

    rows.push(...details.results);
  }

  return rows.map(row => {
    if (row.platform !== 1 && row.platform !== 2) {
      throw new Error(`不正なFirebase platformです: ${row.platform}`);
    }
    return {
      attempt_count: row.attempt_count,
      notification_push_delivery_id: row.notification_push_delivery_id,
      notification_schedule_id: row.notification_schedule_id,
      notification_id: row.notification_id,
      first_attempt_at: row.first_attempt_at,
      notification_type: 'notification_general',
      firebase_token_id: row.firebase_token_id,
      fcm_token: row.fcm_token,
      platform: row.platform,
      push_title: row.push_title,
      push_body: row.push_body,
      importance: row.importance as 'low' | 'normal' | 'high',
    };
  });
}
