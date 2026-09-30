import type { D1Database } from '@cloudflare/workers-types';
import {
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  type NotificationPushDeliveryStatus,
} from '../../domain/entities/Notification';
import type { FirebasePlatform } from '../../domain/entities/FirebaseToken';
import type {
  NotificationPushDeliveryDetail,
  NotificationResultDelivery,
  NotificationScheduleResults,
} from '../../domain/entities/NotificationResultQuery';
import type { INotificationResultQueryRepository } from '../../domain/interfaces/repositories/INotificationResultQueryRepository';

interface ScheduleResultsRow {
  notification_schedule_id: number;
  total_count: number;
  notification_recipient_id: number | null;
  user_id: number | null;
  user_name: string | null;
  notification_push_delivery_id: number | null;
  platform: number | null;
  status: string | null;
  attempt_count: number | null;
  last_attempt_at: string | null;
  sent_at: string | null;
}

interface PushDeliveryRow {
  notification_push_delivery_id: number;
  notification_recipient_id: number;
  firebase_token_id: number | null;
  platform: number;
  status: string;
  attempt_count: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  failed_reason: string | null;
  fcm_message_id: string | null;
}

const scheduleResultsSql = [
  'WITH target_schedule AS (',
  '  SELECT ns.notification_schedule_id',
  '  FROM notification_schedules ns',
  '  INNER JOIN notifications n',
  '    ON n.notification_id = ns.notification_id',
  "   AND n.notification_type = 'notification_general'",
  '  WHERE ns.notification_schedule_id = ?',
  '),',
  'recipient_totals AS (',
  '  SELECT COUNT(*) AS total_count',
  '  FROM notification_recipients nr',
  '  INNER JOIN target_schedule ts',
  '    ON ts.notification_schedule_id = nr.notification_schedule_id',
  '),',
  'paged_recipients AS (',
  '  SELECT nr.notification_recipient_id, nr.user_id',
  '  FROM notification_recipients nr',
  '  INNER JOIN target_schedule ts',
  '    ON ts.notification_schedule_id = nr.notification_schedule_id',
  '  ORDER BY nr.notification_recipient_id',
  '  LIMIT ? OFFSET ?',
  ')',
  'SELECT ts.notification_schedule_id,',
  '       (SELECT total_count FROM recipient_totals) AS total_count,',
  '       pr.notification_recipient_id,',
  '       pr.user_id,',
  '       u.user_name,',
  '       d.notification_push_delivery_id,',
  '       d.platform,',
  '       d.status,',
  '       d.attempt_count,',
  '       d.last_attempt_at,',
  '       d.sent_at',
  'FROM target_schedule ts',
  'LEFT JOIN paged_recipients pr ON 1 = 1',
  'LEFT JOIN users u ON u.user_id = pr.user_id',
  'LEFT JOIN notification_push_deliveries d',
  '  ON d.notification_recipient_id = pr.notification_recipient_id',
  'ORDER BY pr.notification_recipient_id, d.notification_push_delivery_id',
].join('\n');

const pushDeliveryDetailSql = [
  'SELECT d.notification_push_delivery_id,',
  '       d.notification_recipient_id,',
  '       d.firebase_token_id,',
  '       d.platform,',
  '       d.status,',
  '       d.attempt_count,',
  '       d.first_attempt_at,',
  '       d.last_attempt_at,',
  '       d.next_retry_at,',
  '       d.sent_at,',
  '       d.failed_reason,',
  '       d.fcm_message_id',
  'FROM notification_push_deliveries d',
  'INNER JOIN notification_recipients r',
  '  ON r.notification_recipient_id = d.notification_recipient_id',
  'WHERE d.notification_push_delivery_id = ?',
].join('\n');

export function createNotificationResultQueryRepository(
  db: D1Database
): INotificationResultQueryRepository {
  return {
    async findScheduleResults(notificationScheduleId, options) {
      const result = await db
        .prepare(scheduleResultsSql)
        .bind(
          notificationScheduleId,
          options.limit,
          (options.page - 1) * options.limit
        )
        .all<ScheduleResultsRow>();
      const firstRow = result.results[0];
      if (!firstRow) return null;

      const recipients = new Map<
        number,
        NotificationScheduleResults['recipients'][number]
      >();
      for (const row of result.results) {
        if (
          row.notification_recipient_id === null ||
          row.user_id === null ||
          row.user_name === null
        ) {
          continue;
        }
        let recipient = recipients.get(row.notification_recipient_id);
        if (!recipient) {
          recipient = {
            notification_recipient_id: row.notification_recipient_id,
            user_id: row.user_id,
            user_name: row.user_name,
            deliveries: [],
          };
          recipients.set(row.notification_recipient_id, recipient);
        }
        if (row.notification_push_delivery_id !== null) {
          recipient.deliveries.push(toResultDelivery(row));
        }
      }

      return {
        notification_schedule_id: firstRow.notification_schedule_id,
        total_count: firstRow.total_count,
        recipients: [...recipients.values()],
      };
    },

    async findPushDeliveryById(notificationPushDeliveryId) {
      const row = await db
        .prepare(pushDeliveryDetailSql)
        .bind(notificationPushDeliveryId)
        .first<PushDeliveryRow>();
      return row ? toPushDeliveryDetail(row) : null;
    },
  };
}

function toResultDelivery(row: ScheduleResultsRow): NotificationResultDelivery {
  if (
    row.notification_push_delivery_id === null ||
    row.platform === null ||
    row.status === null ||
    row.attempt_count === null
  ) {
    throw new Error('Invalid notification push delivery row');
  }
  return {
    notification_push_delivery_id: row.notification_push_delivery_id,
    platform: toPlatform(row.platform),
    status: toDeliveryStatus(row.status),
    attempt_count: row.attempt_count,
    last_attempt_at: row.last_attempt_at,
    sent_at: row.sent_at,
  };
}

function toPushDeliveryDetail(
  row: PushDeliveryRow
): NotificationPushDeliveryDetail {
  return {
    notification_push_delivery_id: row.notification_push_delivery_id,
    notification_recipient_id: row.notification_recipient_id,
    firebase_token_id: row.firebase_token_id,
    platform: toPlatform(row.platform),
    status: toDeliveryStatus(row.status),
    attempt_count: row.attempt_count,
    first_attempt_at: row.first_attempt_at,
    last_attempt_at: row.last_attempt_at,
    next_retry_at: row.next_retry_at,
    sent_at: row.sent_at,
    failed_reason: row.failed_reason,
    fcm_message_id: row.fcm_message_id,
  };
}

function toPlatform(value: number): FirebasePlatform {
  if (value !== 1 && value !== 2) {
    throw new Error(`Unexpected notification platform: ${value}`);
  }
  return value;
}

function toDeliveryStatus(value: string): NotificationPushDeliveryStatus {
  if (
    !NOTIFICATION_PUSH_DELIVERY_STATUSES.includes(
      value as NotificationPushDeliveryStatus
    )
  ) {
    throw new Error(`Unexpected notification delivery status: ${value}`);
  }
  return value as NotificationPushDeliveryStatus;
}
