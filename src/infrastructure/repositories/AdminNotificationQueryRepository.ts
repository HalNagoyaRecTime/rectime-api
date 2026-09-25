import type { D1Database } from '@cloudflare/workers-types';
import type {
  AdminNotificationQueryAudienceItem,
  AdminNotificationQueryResult,
  AdminNotificationQuerySchedule,
  AdminNotificationQueryUserReference,
} from '../../domain/entities/AdminNotificationQuery';
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
import type { IAdminNotificationQueryRepository } from '../../domain/interfaces/repositories/IAdminNotificationQueryRepository';

interface NotificationRow {
  notification_id: number;
  push_title: string;
  push_body: string;
  detail_title: string;
  detail_body: string;
  importance: string;
  source_type: string | null;
  source_id: number | null;
  source_label: string | null;
  created_by_user_id: number | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ScheduleRow {
  notification_id: number;
  notification_schedule_id: number;
  send_at: string;
  send_status: string;
  stopped_at: string | null;
  stopped_by_user_id: number | null;
  stopped_by_user_name: string | null;
  reason: string | null;
  scheduled_by_user_id: number | null;
  scheduled_by_user_name: string | null;
  created_at: string;
  recipients_resolved_at: string | null;
}

interface AudienceRow {
  notification_schedule_id: number;
  audience_type: string;
  target_id: number | null;
  label: string | null;
}

interface RecipientSummaryRow {
  notification_schedule_id: number;
  total_count: number;
  success_count: number;
  failed_count: number;
  no_push_target_count: number;
}

const notificationSelection = `
  n.notification_id,
  n.push_title,
  n.push_body,
  n.title AS detail_title,
  n.body AS detail_body,
  n.importance,
  n.source_type,
  n.source_id,
  source_spot.gathering_spot_name AS source_label,
  n.created_by_user_id,
  creator.user_name AS creator_name,
  n.created_at,
  n.updated_at`;

const scheduleSelection = `
  ns.notification_id,
  ns.notification_schedule_id,
  ns.send_at,
  ns.send_status,
  ns.stopped_at,
  ns.stopped_by_user_id,
  stopped_by.user_name AS stopped_by_user_name,
  ns.reason,
  ns.scheduled_by_user_id,
  scheduled_by.user_name AS scheduled_by_user_name,
  ns.created_at,
  ns.recipients_resolved_at`;

const audienceSelection = `
  na.notification_schedule_id,
  na.audience_type,
  na.target_id,
  CASE na.audience_type
    WHEN 'class_room' THEN cr.class_name
    WHEN 'gathering' THEN gs.gathering_spot_name
    WHEN 'event' THEN e.event_name
    WHEN 'user' THEN audience_user.user_name
    ELSE NULL
  END AS label`;

export function createAdminNotificationQueryRepository(
  db: D1Database
): IAdminNotificationQueryRepository {
  return {
    async findAll(options) {
      const scopedScheduleIds = `
        SELECT scoped_schedule.notification_schedule_id
        FROM notification_schedules scoped_schedule
        INNER JOIN notifications scoped_notification
          ON scoped_notification.notification_id = scoped_schedule.notification_id
        WHERE scoped_notification.notification_type = 'notification_general'
          AND datetime(scoped_schedule.send_at) >= datetime(?)
          AND datetime(scoped_schedule.send_at) <= datetime(?)
      `;
      // カレンダーに期間外の日付を表示しないよう、通知と返却するスケジュールを送信日時で絞る。
      const notificationScope = `n.notification_type = 'notification_general' AND EXISTS (
        SELECT 1
        FROM notification_schedules scoped_schedule
        WHERE scoped_schedule.notification_id = n.notification_id
          AND datetime(scoped_schedule.send_at) >= datetime(?)
          AND datetime(scoped_schedule.send_at) <= datetime(?)
      )`;
      const scheduleScope = `ns.notification_schedule_id IN (
        ${scopedScheduleIds}
      )`;
      const audienceScope = `na.notification_schedule_id IN (
        ${scopedScheduleIds}
      )`;
      const notificationBindings = [options.from, options.to];

      const [
        notificationResult,
        scheduleResult,
        audienceResult,
        summaryResult,
      ] = await db.batch([
        db
          .prepare(
            `SELECT ${notificationSelection}
               FROM notifications n
               LEFT JOIN users creator
                 ON creator.user_id = n.created_by_user_id
               LEFT JOIN gatherings source_gathering
                 ON n.source_type = 'gathering'
                AND source_gathering.gathering_id = n.source_id
               LEFT JOIN gathering_spots source_spot
                 ON source_spot.gathering_spot_id = source_gathering.gathering_spot_id
               WHERE ${notificationScope}
               ORDER BY datetime(n.created_at) DESC, n.notification_id DESC`
          )
          .bind(...notificationBindings),
        db
          .prepare(
            `SELECT ${scheduleSelection}
               FROM notification_schedules ns
               LEFT JOIN users scheduled_by
                 ON scheduled_by.user_id = ns.scheduled_by_user_id
               LEFT JOIN users stopped_by
                 ON stopped_by.user_id = ns.stopped_by_user_id
               WHERE ${scheduleScope}
               ORDER BY ns.notification_id, datetime(ns.send_at), ns.notification_schedule_id`
          )
          .bind(...notificationBindings),
        db
          .prepare(
            `SELECT ${audienceSelection}
               FROM notification_audiences na
               LEFT JOIN class_rooms cr
                 ON na.audience_type = 'class_room'
                AND cr.class_room_id = na.target_id
               LEFT JOIN gatherings g
                 ON na.audience_type = 'gathering'
                AND g.gathering_id = na.target_id
               LEFT JOIN gathering_spots gs
                 ON gs.gathering_spot_id = g.gathering_spot_id
               LEFT JOIN events e
                 ON na.audience_type = 'event'
                AND e.event_id = na.target_id
               LEFT JOIN users audience_user
                 ON na.audience_type = 'user'
                AND audience_user.user_id = na.target_id
               WHERE ${audienceScope}
               ORDER BY na.notification_schedule_id, na.notification_audience_id`
          )
          .bind(...notificationBindings),
        db
          .prepare(
            `SELECT nr.notification_schedule_id,
                      COUNT(*) AS total_count,
                      SUM(CASE WHEN EXISTS (
                        SELECT 1 FROM notification_push_deliveries sent_delivery
                        WHERE sent_delivery.notification_recipient_id = nr.notification_recipient_id
                          AND sent_delivery.status = 'sent'
                      ) THEN 1 ELSE 0 END) AS success_count,
                      SUM(CASE WHEN EXISTS (
                        SELECT 1 FROM notification_push_deliveries any_delivery
                        WHERE any_delivery.notification_recipient_id = nr.notification_recipient_id
                      ) AND NOT EXISTS (
                        SELECT 1 FROM notification_push_deliveries sent_delivery
                        WHERE sent_delivery.notification_recipient_id = nr.notification_recipient_id
                          AND sent_delivery.status = 'sent'
                      ) THEN 1 ELSE 0 END) AS failed_count,
                      SUM(CASE WHEN NOT EXISTS (
                        SELECT 1 FROM notification_push_deliveries any_delivery
                        WHERE any_delivery.notification_recipient_id = nr.notification_recipient_id
                      ) THEN 1 ELSE 0 END) AS no_push_target_count
               FROM notification_recipients nr
               WHERE nr.notification_schedule_id IN (
                 ${scopedScheduleIds}
               )
               GROUP BY nr.notification_schedule_id`
          )
          .bind(...notificationBindings),
      ]);

      return assembleResults(
        notificationResult.results as unknown as NotificationRow[],
        scheduleResult.results as unknown as ScheduleRow[],
        audienceResult.results as unknown as AudienceRow[],
        summaryResult.results as unknown as RecipientSummaryRow[]
      );
    },

    async findById(notificationId) {
      const notification = await db
        .prepare(
          `SELECT ${notificationSelection}
           FROM notifications n
           LEFT JOIN users creator
             ON creator.user_id = n.created_by_user_id
           LEFT JOIN gatherings source_gathering
             ON n.source_type = 'gathering'
            AND source_gathering.gathering_id = n.source_id
           LEFT JOIN gathering_spots source_spot
             ON source_spot.gathering_spot_id = source_gathering.gathering_spot_id
           WHERE n.notification_type = 'notification_general'
             AND n.notification_id = ?`
        )
        .bind(notificationId)
        .first<NotificationRow>();
      if (!notification) return null;

      const [scheduleResult, audienceResult, summaryResult] = await db.batch([
        db
          .prepare(
            `SELECT ${scheduleSelection}
             FROM notification_schedules ns
             LEFT JOIN users scheduled_by
               ON scheduled_by.user_id = ns.scheduled_by_user_id
             LEFT JOIN users stopped_by
               ON stopped_by.user_id = ns.stopped_by_user_id
             WHERE ns.notification_id = ?
             ORDER BY datetime(ns.send_at), ns.notification_schedule_id`
          )
          .bind(notificationId),
        db
          .prepare(
            `SELECT ${audienceSelection}
             FROM notification_audiences na
             INNER JOIN notification_schedules ns
               ON ns.notification_schedule_id = na.notification_schedule_id
             LEFT JOIN class_rooms cr
               ON na.audience_type = 'class_room'
              AND cr.class_room_id = na.target_id
             LEFT JOIN gatherings g
               ON na.audience_type = 'gathering'
              AND g.gathering_id = na.target_id
             LEFT JOIN gathering_spots gs
               ON gs.gathering_spot_id = g.gathering_spot_id
             LEFT JOIN events e
               ON na.audience_type = 'event'
              AND e.event_id = na.target_id
             LEFT JOIN users audience_user
               ON na.audience_type = 'user'
              AND audience_user.user_id = na.target_id
             WHERE ns.notification_id = ?
             ORDER BY na.notification_schedule_id, na.notification_audience_id`
          )
          .bind(notificationId),
        db
          .prepare(
            `SELECT nr.notification_schedule_id,
                    COUNT(*) AS total_count,
                    SUM(CASE WHEN EXISTS (
                      SELECT 1 FROM notification_push_deliveries sent_delivery
                      WHERE sent_delivery.notification_recipient_id = nr.notification_recipient_id
                        AND sent_delivery.status = 'sent'
                    ) THEN 1 ELSE 0 END) AS success_count,
                    SUM(CASE WHEN EXISTS (
                      SELECT 1 FROM notification_push_deliveries any_delivery
                      WHERE any_delivery.notification_recipient_id = nr.notification_recipient_id
                    ) AND NOT EXISTS (
                      SELECT 1 FROM notification_push_deliveries sent_delivery
                      WHERE sent_delivery.notification_recipient_id = nr.notification_recipient_id
                        AND sent_delivery.status = 'sent'
                    ) THEN 1 ELSE 0 END) AS failed_count,
                    SUM(CASE WHEN NOT EXISTS (
                      SELECT 1 FROM notification_push_deliveries any_delivery
                      WHERE any_delivery.notification_recipient_id = nr.notification_recipient_id
                    ) THEN 1 ELSE 0 END) AS no_push_target_count
             FROM notification_recipients nr
             INNER JOIN notification_schedules ns
               ON ns.notification_schedule_id = nr.notification_schedule_id
             WHERE ns.notification_id = ?
             GROUP BY nr.notification_schedule_id`
          )
          .bind(notificationId),
      ]);

      return (
        assembleResults(
          [notification],
          scheduleResult.results as unknown as ScheduleRow[],
          audienceResult.results as unknown as AudienceRow[],
          summaryResult.results as unknown as RecipientSummaryRow[]
        )[0] ?? null
      );
    },
  };
}

function assembleResults(
  notificationRows: NotificationRow[],
  scheduleRows: ScheduleRow[],
  audienceRows: AudienceRow[],
  recipientSummaryRows: RecipientSummaryRow[]
): AdminNotificationQueryResult[] {
  const audiencesBySchedule = groupBy(
    audienceRows.map(row => ({
      notification_schedule_id: row.notification_schedule_id,
      item: toAudienceItem(row),
    })),
    row => row.notification_schedule_id
  );
  const summariesBySchedule = new Map(
    recipientSummaryRows.map(row => [row.notification_schedule_id, row])
  );
  const schedulesByNotification = groupBy(
    scheduleRows,
    row => row.notification_id
  );

  return notificationRows.map(row => ({
    notification_id: row.notification_id,
    push_title: row.push_title,
    push_body: row.push_body,
    detail_title: row.detail_title,
    detail_body: row.detail_body,
    importance: toImportance(row.importance),
    creation: toCreation(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
    schedules: (schedulesByNotification.get(row.notification_id) ?? []).map(
      schedule =>
        toSchedule(
          schedule,
          (
            audiencesBySchedule.get(schedule.notification_schedule_id) ?? []
          ).map(audience => audience.item),
          summariesBySchedule.get(schedule.notification_schedule_id)
        )
    ),
  }));
}

function toCreation(row: NotificationRow) {
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

function toSchedule(
  row: ScheduleRow,
  audienceItems: AdminNotificationQueryAudienceItem[],
  summary: RecipientSummaryRow | undefined
): AdminNotificationQuerySchedule {
  const status = toScheduleStatus(row.send_status);
  const stop =
    status === 'stopped' &&
    row.stopped_at !== null &&
    row.reason !== null &&
    NOTIFICATION_STOP_REASONS.includes(row.reason as NotificationStopReason)
      ? {
          reason: row.reason as NotificationStopReason,
          stopped_at: row.stopped_at,
          stopped_by: toUserReference(
            row.stopped_by_user_id,
            row.stopped_by_user_name
          ),
        }
      : null;
  const totalCount = summary?.total_count ?? 0;

  return {
    notification_schedule_id: row.notification_schedule_id,
    send_at: row.send_at,
    status,
    stop,
    scheduled_by: toUserReference(
      row.scheduled_by_user_id,
      row.scheduled_by_user_name
    ),
    created_at: row.created_at,
    audience: {
      items: audienceItems,
      recipient_resolution: {
        status: row.recipients_resolved_at === null ? 'pending' : 'resolved',
        resolved_count: totalCount,
      },
    },
    recipient_push_summary: {
      total_count: totalCount,
      success_count: summary?.success_count ?? 0,
      failed_count: summary?.failed_count ?? 0,
      no_push_target_count: summary?.no_push_target_count ?? 0,
    },
  };
}

function toAudienceItem(row: AudienceRow): AdminNotificationQueryAudienceItem {
  if (row.audience_type === 'all') return { type: 'all' };
  switch (row.audience_type) {
    case 'class_room':
    case 'gathering':
    case 'event':
    case 'user':
      if (row.target_id === null) throw new Error('Audience target is missing');
      return {
        type: row.audience_type,
        target_id: row.target_id,
        label: row.label,
      };
    default:
      throw new Error(`Invalid notification audience: ${row.audience_type}`);
  }
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

function toUserReference(
  userId: number | null,
  userName: string | null
): AdminNotificationQueryUserReference | null {
  return userId === null || userName === null
    ? null
    : { user_id: userId, user_name: userName };
}

function groupBy<T, K extends string | number>(
  values: T[],
  getKey: (value: T) => K
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
}
