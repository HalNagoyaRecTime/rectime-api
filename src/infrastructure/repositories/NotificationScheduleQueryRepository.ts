import type { D1Database } from '@cloudflare/workers-types';
import type {
  NotificationScheduleQueryBase,
  NotificationScheduleQueryListItem,
  NotificationScheduleQueryOptions,
  NotificationScheduleQueryProgress,
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
  failed_reason: string | null;
  created_by_user_id: number | null;
  creator_name: string | null;
  source_type: string | null;
  source_id: number | null;
  source_label: string | null;
}

interface ScheduleProgressQueryRow extends ScheduleQueryRow {
  progress_counted: number;
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
  ns.failed_reason,
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

// stoppedは停止後もcronが残りの配信をstoppedへ書き換えていくので、数え直さない側に含めない。
const progressSettledStatuses = `('completed', 'failed')`;

// 数えないScheduleを除く条件をONにANDで足すと、SQLiteは索引でRecipientを引いた後に
// 判定するため送り終えたScheduleのRecipientまで読む。引く値自体をNULLにして索引で何も引かせない。
function selectSchedulesWithProgress(
  where: string,
  progressCounted: string
): string {
  return `SELECT ${scheduleSelection},
           ${progressCounted} AS progress_counted,
           CASE WHEN ${progressCounted} THEN (
             SELECT COUNT(*) FROM notification_audiences na
             WHERE na.notification_schedule_id = ns.notification_schedule_id
           ) END AS audience_total_count,
           CASE WHEN ${progressCounted} THEN (
             SELECT COUNT(na.resolved_at) FROM notification_audiences na
             WHERE na.notification_schedule_id = ns.notification_schedule_id
           ) END AS audience_resolved_count,
           COUNT(DISTINCT nr.notification_recipient_id) AS recipient_count,
           CASE WHEN ns.recipients_resolved_at IS NULL
                THEN 'pending' ELSE 'resolved' END AS recipient_status,
           COUNT(npd.notification_push_delivery_id) AS delivery_total_count,
           COUNT(CASE WHEN npd.status = 'pending' THEN 1 END)
             AS delivery_pending_count,
           COUNT(CASE WHEN npd.status = 'sending' THEN 1 END)
             AS delivery_sending_count,
           COUNT(CASE WHEN npd.status = 'retry_wait' THEN 1 END)
             AS delivery_retry_wait_count,
           COUNT(CASE WHEN npd.status = 'sent' THEN 1 END)
             AS delivery_sent_count,
           COUNT(CASE WHEN npd.status = 'failed' THEN 1 END)
             AS delivery_failed_count,
           COUNT(CASE WHEN npd.status = 'stopped' THEN 1 END)
             AS delivery_stopped_count
    FROM notification_schedules ns
    ${notificationJoins}
    LEFT JOIN notification_recipients nr
      ON nr.notification_schedule_id =
         CASE WHEN ${progressCounted} THEN ns.notification_schedule_id END
    LEFT JOIN notification_push_deliveries npd
      ON npd.notification_recipient_id = nr.notification_recipient_id
    WHERE ${where}
    GROUP BY ns.notification_schedule_id`;
}

export function createNotificationScheduleQueryRepository(
  db: D1Database
): INotificationScheduleQueryRepository {
  return {
    async findAll(options: NotificationScheduleQueryOptions) {
      const result = await db
        .prepare(
          `${selectSchedulesWithProgress(
            `datetime(ns.send_at) >= datetime(?)
             AND datetime(ns.send_at) <= datetime(?)`,
            `ns.send_status NOT IN ${progressSettledStatuses}`
          )}
           ORDER BY datetime(ns.send_at), ns.notification_schedule_id`
        )
        .bind(options.from, options.to)
        .all<ScheduleProgressQueryRow>();
      return result.results.map(toListItem);
    },

    async findById(notificationScheduleId: number) {
      const row = await db
        .prepare(
          selectSchedulesWithProgress('ns.notification_schedule_id = ?', '1')
        )
        .bind(notificationScheduleId)
        .first<ScheduleProgressQueryRow>();
      return row ? { ...toBase(row), ...toProgress(row) } : null;
    },
  };
}

function toBase(row: ScheduleQueryRow): NotificationScheduleQueryBase {
  return {
    notification_id: row.notification_id,
    notification_schedule_id: row.notification_schedule_id,
    push_title: row.push_title,
    push_body: row.push_body,
    importance: toImportance(row.importance),
    send_at: row.send_at,
    status: toScheduleStatus(row.send_status),
    failure_reason:
      row.send_status === 'failed' ? (row.reason ?? row.failed_reason) : null,
    stop: toStop(row),
    creation: toCreation(row),
  };
}

function toListItem(
  row: ScheduleProgressQueryRow
): NotificationScheduleQueryListItem {
  return {
    ...toBase(row),
    ...(row.progress_counted
      ? toProgress(row)
      : {
          audience_progress: null,
          recipient_progress: null,
          delivery_progress: null,
        }),
  };
}

function toProgress(
  row: ScheduleProgressQueryRow
): NotificationScheduleQueryProgress {
  return {
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
