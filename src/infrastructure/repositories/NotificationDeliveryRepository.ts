import { sendableRecipientSql } from './notificationDeliveryEligibility';
import type { D1Database } from '@cloudflare/workers-types';
import type { ClaimedNotificationPushDelivery } from '../../domain/entities/NotificationDelivery';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';
import {
  FCM_MAX_ATTEMPTS,
  FCM_RETRY_WINDOW_SECONDS,
  FCM_CONFIG_BLOCKED_REASON,
} from '../../domain/entities/NotificationRetryPolicy';

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

// 受信者からたどると予約の受信者を毎回すべて読むため、配信が持つ予約IDでstatusのindexを引く。
const deliveriesOfSchedule = (scheduleId: string, statuses: string) =>
  `notification_push_deliveries d
   WHERE d.status IN (${statuses})
     AND d.notification_schedule_id = ${scheduleId}`;

export function createNotificationDeliveryRepository(
  db: D1Database,
  options: { automaticDeliveryEnabled?: boolean } = {}
): INotificationDeliveryRepository {
  const sourceAllowed = (alias: string, manualOnly = false) =>
    options.automaticDeliveryEnabled === false || manualOnly
      ? `${alias}.source_type IS NULL`
      : '1 = 1';
  return {
    async findReadySchedules(now, limit, manualOnly) {
      // send_atを関数で包むとindexの範囲で引けないため。
      const rows = await db
        .prepare(
          `SELECT s.notification_schedule_id, s.send_status
           FROM notification_schedules s
           JOIN notifications n ON n.notification_id = s.notification_id
           WHERE n.notification_type = 'notification_general' AND ${sourceAllowed('n', manualOnly)}
             AND s.send_at < strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?), '+1 second')
             AND (
               (s.send_status = 'resolving'
                AND s.recipients_resolved_at IS NOT NULL)
               OR (s.send_status = 'sending'
                   AND s.recipients_resolved_at IS NOT NULL
                   AND (
                     EXISTS (
                       SELECT 1 FROM ${deliveriesOfSchedule('s.notification_schedule_id', "'pending'")}
                     )
                     OR NOT EXISTS (
                       SELECT 1 FROM ${deliveriesOfSchedule('s.notification_schedule_id', "'pending', 'sending', 'retry_wait'")}
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
               notification_recipient_id, notification_schedule_id,
               firebase_token_id, platform, status,
               attempt_count, created_at, updated_at
             )
             SELECT r.notification_recipient_id, r.notification_schedule_id,
                    t.firebase_token_id, t.platform,
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
                   AND n.notification_type = 'notification_general' AND ${sourceAllowed('n')}
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
                 SELECT 1 FROM ${deliveriesOfSchedule('notification_schedules.notification_schedule_id', "'pending', 'sending', 'retry_wait'")}
               )`
          )
          .bind(now, now, scheduleId),
      ]);
      return results[2]?.meta.changes === 1;
    },

    async hasPendingDeliveries(scheduleId) {
      const row = await db
        .prepare(
          `SELECT 1 AS found FROM ${deliveriesOfSchedule('?1', "'pending'")}
             AND d.firebase_token_id IS NOT NULL AND ${sendableRecipientSql('d')}
           LIMIT 1`
        )
        .bind(scheduleId)
        .first();
      return row !== null;
    },

    async markPendingDeliveriesWithoutTokenFailed(scheduleId, reason, now) {
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
           SET status = 'failed',
               failed_reason = ?1,
               sent_at = NULL,
               next_retry_at = NULL,
               updated_at = ?2
           WHERE status = 'pending'
             AND notification_schedule_id = ?3
             AND (firebase_token_id IS NULL OR NOT ${sendableRecipientSql('notification_push_deliveries')})`
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes;
    },

    async findPendingDeliveryIds(scheduleIds, limit, manualOnly) {
      if (scheduleIds.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT d.notification_push_delivery_id
           FROM notification_schedules s
           CROSS JOIN notifications n ON n.notification_id = s.notification_id
           CROSS JOIN ${deliveriesOfSchedule('s.notification_schedule_id', "'pending'")}
             AND s.notification_schedule_id IN (${scheduleIds.map(() => '?').join(', ')})
             AND s.send_status = 'sending'
             AND n.notification_type = 'notification_general' AND ${sourceAllowed('n', manualOnly)}
             AND d.firebase_token_id IS NOT NULL AND ${sendableRecipientSql('d')}
           LIMIT ?`
        )
        .bind(...scheduleIds, limit)
        .all<DeliveryIdRow>();
      return rows.results.map(row => row.notification_push_delivery_id);
    },
    async claimPendingDeliveries(deliveryIds, now, manualOnly) {
      return claimDeliveryIds(
        db,
        deliveryIds,
        now,
        "status = 'pending'",
        [],
        sourceAllowed('n', manualOnly)
      );
    },
    async claimRetryDeliveries(now, staleBefore, limit, deliveryIds) {
      return claimRetryDeliveries(
        db,
        now,
        limit,
        staleBefore,
        deliveryIds,
        sourceAllowed('n')
      );
    },
    async findDueRetryDeliveryIds(now, staleBefore, afterId, limit) {
      const rows = await db
        .prepare(
          `SELECT d.notification_push_delivery_id
        FROM notification_push_deliveries d
        JOIN notification_recipients r USING (notification_recipient_id)
        JOIN notification_schedules s USING (notification_schedule_id)
        JOIN notifications n USING (notification_id)
        WHERE d.notification_push_delivery_id > ? AND s.send_status = 'sending'
          AND n.notification_type = 'notification_general' AND ${sourceAllowed('n')} AND d.firebase_token_id IS NOT NULL AND ${sendableRecipientSql('d')}
          AND (d.failed_reason = ? OR (d.attempt_count < ? AND julianday(d.first_attempt_at, ?) >= julianday(?)))
          AND ((d.status = 'retry_wait' AND julianday(d.next_retry_at) <= julianday(?))
            OR (d.status = 'sending' AND julianday(d.last_attempt_at) < julianday(?)))
        ORDER BY d.notification_push_delivery_id LIMIT ?`
        )
        .bind(
          afterId,
          FCM_CONFIG_BLOCKED_REASON,
          FCM_MAX_ATTEMPTS,
          `+${FCM_RETRY_WINDOW_SECONDS} seconds`,
          now,
          now,
          staleBefore,
          limit
        )
        .all<DeliveryIdRow>();
      return rows.results.map(row => row.notification_push_delivery_id);
    },
    async renewDeliveryLease(deliveryId, attemptCount, now, staleBefore) {
      // attemptを所有するWorkerだけが、送信直前にleaseを更新できる。
      const result = await db
        .prepare(
          `UPDATE notification_push_deliveries
        SET last_attempt_at = ?, updated_at = ?
        WHERE notification_push_delivery_id = ? AND status = 'sending' AND attempt_count = ?
          AND julianday(last_attempt_at) >= julianday(?)
          AND julianday(first_attempt_at, ?) >= julianday(?)
          AND firebase_token_id IS NOT NULL AND ${sendableRecipientSql('notification_push_deliveries')}
          AND EXISTS (SELECT 1 FROM notification_recipients r
            JOIN notification_schedules s USING (notification_schedule_id)
            WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id
              AND s.send_status = 'sending' AND EXISTS (SELECT 1 FROM notifications n WHERE n.notification_id = s.notification_id AND ${sourceAllowed('n')}))`
        )
        .bind(
          now,
          now,
          deliveryId,
          attemptCount,
          staleBefore,
          `+${FCM_RETRY_WINDOW_SECONDS} seconds`,
          now
        )
        .run();
      return result.meta.changes === 1;
    },
    async retireUnsendableDeliveries(now, staleBefore, maxAttempts) {
      // 送れない未送信の配信は送信側でも失敗にするため、statusから未送信の全件を毎分読まず、Tokenを失ったものだけをTokenのindexから引く。
      const retired = await db
        .prepare(
          `UPDATE notification_push_deliveries
        SET status = CASE WHEN EXISTS (
          SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
          WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'stopped'
        ) THEN 'stopped' ELSE 'failed' END,
        failed_reason = '再送対象のTokenがないか試行上限に到達しました', next_retry_at = NULL, updated_at = ?
        WHERE EXISTS (SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id) JOIN notifications n USING (notification_id) WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND ${sourceAllowed('n')})
          AND (status = 'retry_wait' OR (status = 'sending' AND julianday(last_attempt_at) < julianday(?))
            OR (+status = 'pending' AND firebase_token_id IS NULL))
          AND (firebase_token_id IS NULL OR NOT ${sendableRecipientSql('notification_push_deliveries')} OR (COALESCE(failed_reason, '') <> ? AND attempt_count >= ?) OR EXISTS (
            SELECT 1 FROM notification_recipients r JOIN notification_schedules s USING (notification_schedule_id)
            WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id AND s.send_status = 'stopped'
          ) OR (COALESCE(failed_reason, '') <> ? AND status IN ('retry_wait', 'sending') AND first_attempt_at IS NOT NULL
            AND julianday(first_attempt_at, ?) < julianday(?)))
        RETURNING (SELECT notification_schedule_id FROM notification_recipients r
          WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id) AS notification_schedule_id`
        )
        .bind(
          now,
          staleBefore,
          FCM_CONFIG_BLOCKED_REASON,
          maxAttempts,
          FCM_CONFIG_BLOCKED_REASON,
          `+${FCM_RETRY_WINDOW_SECONDS} seconds`,
          now
        )
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
               SELECT 1 FROM ${deliveriesOfSchedule('notification_schedules.notification_schedule_id', "'pending', 'sending', 'retry_wait'")}
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
                 AND n.notification_type = 'notification_general' AND ${sourceAllowed('n')}
             )`
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },
  };
}

async function claimRetryDeliveries(
  db: D1Database,
  now: string,
  limit: number,
  staleBefore: string,
  deliveryIds: number[] | undefined,
  sourceAllowed: string
): Promise<ClaimedNotificationPushDelivery[]> {
  if (deliveryIds?.length === 0) return [];
  const eligible =
    "(failed_reason = ? OR (attempt_count < ? AND first_attempt_at IS NOT NULL AND julianday(first_attempt_at, ?) >= julianday(?))) AND ((status = 'retry_wait' AND julianday(next_retry_at) <= julianday(?)) OR (status = 'sending' AND julianday(last_attempt_at) < julianday(?)))";
  const eligibilityBindings = [
    FCM_CONFIG_BLOCKED_REASON,
    FCM_MAX_ATTEMPTS,
    `+${FCM_RETRY_WINDOW_SECONDS} seconds`,
    now,
    now,
    staleBefore,
  ];
  const qualifiedEligible = eligible.replace(
    /\b(status|attempt_count|next_retry_at|last_attempt_at|failed_reason)\b/g,
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
           WHERE s.send_status = 'sending'
             AND n.notification_type = 'notification_general' AND ${sourceAllowed}
             AND ${qualifiedEligible}
             ${deliveryIds ? `AND d.notification_push_delivery_id IN (${deliveryIds.map(() => '?').join(', ')})` : ''}
             AND d.firebase_token_id IS NOT NULL AND ${sendableRecipientSql('d')}
           ORDER BY d.notification_push_delivery_id
           LIMIT ?`
    )
    .bind(...eligibilityBindings, ...(deliveryIds ?? []), limit)
    .all<DeliveryIdRow>();
  return claimDeliveryIds(
    db,
    candidates.results.map(row => row.notification_push_delivery_id),
    now,
    eligible,
    eligibilityBindings,
    sourceAllowed
  );
}

async function claimDeliveryIds(
  db: D1Database,
  deliveryIds: number[],
  now: string,
  eligible: string,
  eligibilityBindings: (string | number)[],
  sourceAllowed: string
): Promise<ClaimedNotificationPushDelivery[]> {
  if (deliveryIds.length === 0) return [];
  const claimed = await db.batch(
    deliveryIds.map(deliveryId =>
      db
        .prepare(
          `UPDATE notification_push_deliveries
               SET status = 'sending',
                   first_attempt_at = CASE WHEN failed_reason = ? THEN ? ELSE COALESCE(first_attempt_at, ?) END,
                   last_attempt_at = ?,
                   attempt_count = CASE WHEN failed_reason = ? THEN 1 ELSE attempt_count + 1 END,
                   next_retry_at = NULL, failed_reason = NULL,
                   updated_at = ?
               WHERE notification_push_delivery_id = ?
                 AND ${eligible}
                 AND firebase_token_id IS NOT NULL AND ${sendableRecipientSql('notification_push_deliveries')}
                 AND EXISTS (
                   SELECT 1
                   FROM notification_recipients r
                   JOIN notification_schedules s
                     ON s.notification_schedule_id = r.notification_schedule_id
                   JOIN notifications n ON n.notification_id = s.notification_id
                   WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id
                     AND s.send_status = 'sending'
                     AND n.notification_type = 'notification_general' AND ${sourceAllowed}
                 )
               RETURNING notification_push_delivery_id`
        )
        .bind(
          FCM_CONFIG_BLOCKED_REASON,
          now,
          now,
          now,
          FCM_CONFIG_BLOCKED_REASON,
          now,
          deliveryId,
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
             AND n.notification_type = 'notification_general' AND ${sourceAllowed}
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
