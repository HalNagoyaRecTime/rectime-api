import type { D1Database } from '@cloudflare/workers-types';
import type {
  NotificationScheduleQueryDetail,
  NotificationScheduleQueryListItem,
  NotificationScheduleQueryOptions,
} from '../../domain/entities/NotificationScheduleQuery';
import {
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_STOP_REASONS,
  type NotificationImportance,
  type NotificationScheduleStatus,
  type NotificationSourceType,
  type NotificationStopReason,
} from '../../domain/entities/Notification';
import type { INotificationScheduleQueryRepository } from '../../domain/interfaces/repositories/INotificationScheduleQueryRepository';

interface ScheduleQueryRow {
  notification_id: number;
  notification_schedule_id: number;
  push_title: string;
  push_body: string;
  importance: string;
  send_at: string;
  send_status: string;
  stopped_at: string | null;
  stopped_by_user_id: number | null;
  stopped_by_user_name: string | null;
  reason: string | null;
  created_by_user_id: number | null;
  creator_name: string | null;
  source_type: string | null;
  source_id: number | null;
  source_label: string | null;
}

interface ScheduleDetailQueryRow extends ScheduleQueryRow {
  audience_total_count: number;
  audience_resolved_count: number;
  recipient_count: number;
  recipient_status: string;
  delivery_total_count: number;
  delivery_pending_count: number;
  delivery_sending_count: number;
  delivery_retry_wait_count: number;
  delivery_sent_count: number;
  delivery_failed_count: number;
  delivery_stopped_count: number;
}

const scheduleSelection = `
  n.notification_id,
  ns.notification_schedule_id,
  n.push_title,
  n.push_body,
  n.importance,
  ns.send_at,
  ns.send_status,
  ns.stopped_at,
  ns.stopped_by_user_id,
  stopped_by.user_name AS stopped_by_user_name,
  ns.reason,
  n.created_by_user_id,
  creator.user_name AS creator_name,
  n.source_type,
  n.source_id,
  source_spot.gathering_spot_name AS source_label`;

const notificationJoins = `
  INNER JOIN notifications n
    ON n.notification_id = ns.notification_id
   AND n.notification_type = 'notification_general'
  LEFT JOIN users creator
    ON creator.user_id = n.created_by_user_id
  LEFT JOIN users stopped_by
    ON stopped_by.user_id = ns.stopped_by_user_id
  LEFT JOIN gatherings source_gathering
    ON n.source_type = 'gathering'
   AND source_gathering.gathering_id = n.source_id
  LEFT JOIN gathering_spots source_spot
    ON source_spot.gathering_spot_id = source_gathering.gathering_spot_id`;

export function createNotificationScheduleQueryRepository(
  db: D1Database
): INotificationScheduleQueryRepository {
  return {
    async findAll(options: NotificationScheduleQueryOptions) {
      const result = await db
        .prepare(
          `SELECT ${scheduleSelection}
           FROM notification_schedules ns
           ${notificationJoins}
           WHERE datetime(ns.send_at) >= datetime(?)
             AND datetime(ns.send_at) <= datetime(?)
           ORDER BY datetime(ns.send_at), ns.notification_schedule_id`
        )
        .bind(options.from, options.to)
        .all<ScheduleQueryRow>();
      return result.results.map(toListItem);
    },

    async findById(notificationScheduleId: number) {
      const row = await db
        .prepare(
          `WITH target_schedule AS (
             SELECT notification_schedule_id
             FROM notification_schedules
             WHERE notification_schedule_id = ?
           ),
           audience_progress AS (
             SELECT na.notification_schedule_id,
                    COUNT(*) AS total_count,
                    SUM(CASE WHEN na.resolved_at IS NOT NULL THEN 1 ELSE 0 END)
                      AS resolved_count
             FROM notification_audiences na
             INNER JOIN target_schedule ts
               ON ts.notification_schedule_id = na.notification_schedule_id
             GROUP BY na.notification_schedule_id
           ),
           recipient_progress AS (
             SELECT nr.notification_schedule_id,
                    COUNT(*) AS recipient_count
             FROM notification_recipients nr
             INNER JOIN target_schedule ts
               ON ts.notification_schedule_id = nr.notification_schedule_id
             GROUP BY nr.notification_schedule_id
           ),
           delivery_progress AS (
             SELECT nr.notification_schedule_id,
                    COUNT(npd.notification_push_delivery_id) AS total_count,
                    SUM(CASE WHEN npd.status = 'pending' THEN 1 ELSE 0 END)
                      AS pending_count,
                    SUM(CASE WHEN npd.status = 'sending' THEN 1 ELSE 0 END)
                      AS sending_count,
                    SUM(CASE WHEN npd.status = 'retry_wait' THEN 1 ELSE 0 END)
                      AS retry_wait_count,
                    SUM(CASE WHEN npd.status = 'sent' THEN 1 ELSE 0 END)
                      AS sent_count,
                    SUM(CASE WHEN npd.status = 'failed' THEN 1 ELSE 0 END)
                      AS failed_count,
                    SUM(CASE WHEN npd.status = 'stopped' THEN 1 ELSE 0 END)
                      AS stopped_count
             FROM notification_recipients nr
             INNER JOIN target_schedule ts
               ON ts.notification_schedule_id = nr.notification_schedule_id
             LEFT JOIN notification_push_deliveries npd
               ON npd.notification_recipient_id = nr.notification_recipient_id
             GROUP BY nr.notification_schedule_id
           )
           SELECT ${scheduleSelection},
                  COALESCE(ap.total_count, 0) AS audience_total_count,
                  COALESCE(ap.resolved_count, 0) AS audience_resolved_count,
                  COALESCE(rp.recipient_count, 0) AS recipient_count,
                  CASE WHEN ns.recipients_resolved_at IS NULL
                       THEN 'pending' ELSE 'resolved' END AS recipient_status,
                  COALESCE(dp.total_count, 0) AS delivery_total_count,
                  COALESCE(dp.pending_count, 0) AS delivery_pending_count,
                  COALESCE(dp.sending_count, 0) AS delivery_sending_count,
                  COALESCE(dp.retry_wait_count, 0) AS delivery_retry_wait_count,
                  COALESCE(dp.sent_count, 0) AS delivery_sent_count,
                  COALESCE(dp.failed_count, 0) AS delivery_failed_count,
                  COALESCE(dp.stopped_count, 0) AS delivery_stopped_count
           FROM notification_schedules ns
           ${notificationJoins}
           LEFT JOIN audience_progress ap
             ON ap.notification_schedule_id = ns.notification_schedule_id
           LEFT JOIN recipient_progress rp
             ON rp.notification_schedule_id = ns.notification_schedule_id
           LEFT JOIN delivery_progress dp
             ON dp.notification_schedule_id = ns.notification_schedule_id
           WHERE ns.notification_schedule_id = (SELECT notification_schedule_id FROM target_schedule)`
        )
        .bind(notificationScheduleId)
        .first<ScheduleDetailQueryRow>();
      return row ? toDetail(row) : null;
    },
  };
}

function toListItem(row: ScheduleQueryRow): NotificationScheduleQueryListItem {
  return {
    notification_id: row.notification_id,
    notification_schedule_id: row.notification_schedule_id,
    push_title: row.push_title,
    push_body: row.push_body,
    importance: toImportance(row.importance),
    send_at: row.send_at,
    status: toScheduleStatus(row.send_status),
    stop: toStop(row),
    creation: toCreation(row),
  };
}

function toDetail(
  row: ScheduleDetailQueryRow
): NotificationScheduleQueryDetail {
  const base = toListItem(row);
  return {
    ...base,
    audience_progress: {
      total_count: row.audience_total_count,
      resolved_count: row.audience_resolved_count,
    },
    recipient_progress: {
      count: row.recipient_count,
      status: toRecipientStatus(row.recipient_status),
    },
    delivery_progress: {
      total_count: row.delivery_total_count,
      pending_count: row.delivery_pending_count,
      sending_count: row.delivery_sending_count,
      retry_wait_count: row.delivery_retry_wait_count,
      sent_count: row.delivery_sent_count,
      failed_count: row.delivery_failed_count,
      stopped_count: row.delivery_stopped_count,
    },
  };
}

function toStop(row: ScheduleQueryRow) {
  if (
    toScheduleStatus(row.send_status) !== 'stopped' ||
    row.stopped_at === null ||
    row.reason === null ||
    !NOTIFICATION_STOP_REASONS.includes(row.reason as NotificationStopReason)
  ) {
    return null;
  }
  return {
    reason: row.reason as NotificationStopReason,
    stopped_at: row.stopped_at,
    stopped_by:
      row.stopped_by_user_id === null || row.stopped_by_user_name === null
        ? null
        : {
            user_id: row.stopped_by_user_id,
            user_name: row.stopped_by_user_name,
          },
  };
}

function toCreation(row: ScheduleQueryRow) {
  if (row.source_type === null) {
    return {
      method: 'manual' as const,
      user:
        row.created_by_user_id === null || row.creator_name === null
          ? null
          : {
              user_id: row.created_by_user_id,
              user_name: row.creator_name,
            },
      source: null,
    };
  }
  if (
    !NOTIFICATION_SOURCE_TYPES.includes(
      row.source_type as NotificationSourceType
    ) ||
    row.source_id === null
  ) {
    throw new Error('Invalid notification source');
  }
  return {
    method: 'automatic' as const,
    user: null,
    source: {
      type: row.source_type as NotificationSourceType,
      id: row.source_id,
      label: row.source_label,
    },
  };
}

function toImportance(value: string): NotificationImportance {
  if (
    !NOTIFICATION_IMPORTANCE_LEVELS.includes(value as NotificationImportance)
  ) {
    throw new Error(`Invalid notification importance: ${value}`);
  }
  return value as NotificationImportance;
}

function toScheduleStatus(value: string): NotificationScheduleStatus {
  if (
    !NOTIFICATION_SCHEDULE_STATUSES.includes(
      value as NotificationScheduleStatus
    )
  ) {
    throw new Error(`Invalid notification schedule status: ${value}`);
  }
  return value as NotificationScheduleStatus;
}

function toRecipientStatus(value: string): 'pending' | 'resolved' {
  if (value === 'pending' || value === 'resolved') return value;
  throw new Error(`Invalid recipient status: ${value}`);
}
