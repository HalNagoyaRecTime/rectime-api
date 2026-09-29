import type { D1Database } from '@cloudflare/workers-types';
import type {
  AdminNotificationSnapshot,
  NotificationAudienceSnapshot,
  NotificationScheduleSnapshot,
  NotificationUserSnapshot,
} from '../../domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../domain/interfaces/repositories/IAdminNotificationQueryRepository';
import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from '../../domain/entities/Notification';

import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_STOP_REASONS,
} from '../../domain/entities/Notification';

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
  recipient_count?: number;
  success_count?: number;
  failed_count?: number;
  no_push_target_count?: number;
}

interface AudienceRow {
  notification_schedule_id: number;
  notification_audience_id: number;
  audience_type: string;
  target_id: number | null;
  label: string | null;
  resolved_at: string | null;
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
  na.notification_audience_id,
  na.audience_type,
  na.target_id,
  CASE na.audience_type
    WHEN 'class_room' THEN cr.class_name
    WHEN 'gathering' THEN gs.gathering_spot_name
    WHEN 'event' THEN e.event_name
    WHEN 'user' THEN audience_user.user_name
    ELSE NULL
  END AS label,
  na.resolved_at`;

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
      // 通知の対象判定と返却Scheduleを同じ期間条件で絞り、期間外Scheduleを混在させない。
      const notificationScope = `n.notification_type = 'notification_general' AND EXISTS (
        SELECT 1
        FROM notification_schedules scoped_schedule
        WHERE scoped_schedule.notification_id = n.notification_id
          AND datetime(scoped_schedule.send_at) >= datetime(?)
          AND datetime(scoped_schedule.send_at) <= datetime(?)
      )`;
      const scheduleScope = `ns.notification_schedule_id IN (${scopedScheduleIds})`;
      const audienceScope = `na.notification_schedule_id IN (${scopedScheduleIds})`;
      const bindings = [options.from, options.to];

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
          .bind(...bindings),
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
          .bind(...bindings),
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
          .bind(...bindings),
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
          .bind(...bindings),
      ]);

      return assembleSnapshots(
        notificationResult.results as unknown as NotificationRow[],
        scheduleResult.results as unknown as ScheduleRow[],
        audienceResult.results as unknown as AudienceRow[],
        summaryResult.results as unknown as RecipientSummaryRow[]
      );
    },
    async findById(notificationId) {
      const root = await db
        .prepare(
          `SELECT ${notificationSelection}
           FROM notifications n
           LEFT JOIN users creator ON creator.user_id = n.created_by_user_id
           LEFT JOIN gatherings source_gathering
             ON n.source_type = 'gathering'
            AND source_gathering.gathering_id = n.source_id
           LEFT JOIN gathering_spots source_spot
             ON source_spot.gathering_spot_id = source_gathering.gathering_spot_id
           WHERE n.notification_id = ?
             AND n.notification_type = 'notification_general'`
        )
        .bind(notificationId)
        .first<NotificationRow>();
      if (!root) return null;

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
        assembleSnapshots(
          [root],
          scheduleResult.results as unknown as ScheduleRow[],
          audienceResult.results as unknown as AudienceRow[],
          summaryResult.results as unknown as RecipientSummaryRow[]
        )[0] ?? null
      );
    },
  };
}

function toUserSnapshot(
  userId: number | null,
  userName: string | null
): NotificationUserSnapshot | null {
  if (userId === null || userName === null) return null;
  return { user_id: userId, user_name: userName };
}

function assembleSnapshots(
  notificationRows: NotificationRow[],
  scheduleRows: ScheduleRow[],
  audienceRows: AudienceRow[],
  summaryRows: RecipientSummaryRow[]
): AdminNotificationSnapshot[] {
  const audiencesBySchedule = groupBy(
    audienceRows.map(row => ({
      notification_schedule_id: row.notification_schedule_id,
      audience: toAudienceSnapshot(row),
    })),
    row => row.notification_schedule_id
  );
  const summariesBySchedule = new Map(
    summaryRows.map(row => [row.notification_schedule_id, row])
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
    source_type: toSourceType(row.source_type),
    source_id: row.source_id,
    source_label: row.source_label,
    created_by: toUserSnapshot(row.created_by_user_id, row.creator_name),
    created_at: row.created_at,
    updated_at: row.updated_at,
    schedules: (schedulesByNotification.get(row.notification_id) ?? []).map(
      schedule =>
        toScheduleSnapshot(
          schedule,
          (
            audiencesBySchedule.get(schedule.notification_schedule_id) ?? []
          ).map(item => item.audience),
          summariesBySchedule.get(schedule.notification_schedule_id)
        )
    ),
  }));
}

function toScheduleSnapshot(
  row: ScheduleRow,
  audiences: NotificationAudienceSnapshot[],
  summary: RecipientSummaryRow | undefined
): NotificationScheduleSnapshot {
  const status = toScheduleStatus(row.send_status);
  return {
    notification_schedule_id: row.notification_schedule_id,
    send_at: row.send_at,
    status,
    stop_reason: status === 'stopped' ? toStopReason(row.reason) : null,
    stopped_at: row.stopped_at,
    stopped_by: toUserSnapshot(
      row.stopped_by_user_id,
      row.stopped_by_user_name
    ),
    scheduled_by: toUserSnapshot(
      row.scheduled_by_user_id,
      row.scheduled_by_user_name
    ),
    created_at: row.created_at,
    recipients_resolved_at: row.recipients_resolved_at,
    audiences,
    recipient_count: summary?.total_count ?? row.recipient_count ?? 0,
    success_count: summary?.success_count ?? row.success_count ?? 0,
    failed_count: summary?.failed_count ?? row.failed_count ?? 0,
    no_push_target_count:
      summary?.no_push_target_count ?? row.no_push_target_count ?? 0,
  };
}

function toAudienceSnapshot(row: AudienceRow): NotificationAudienceSnapshot {
  const type = toAudienceType(row.audience_type);
  if (type !== 'all' && row.target_id === null) {
    throw new Error('通知Audienceの対象IDがありません');
  }
  return {
    type,
    target_id: row.target_id,
    label: row.label,
    resolved_at: row.resolved_at,
  };
}

function toAudienceType(value: string): NotificationAudienceType {
  if (
    !NOTIFICATION_AUDIENCE_TYPES.includes(value as NotificationAudienceType)
  ) {
    throw new Error(`通知Audienceの種別が不正です: ${value}`);
  }
  return value as NotificationAudienceType;
}

function toImportance(value: string): NotificationImportance {
  if (
    !NOTIFICATION_IMPORTANCE_LEVELS.includes(value as NotificationImportance)
  ) {
    throw new Error(`通知Importanceの種別が不正です: ${value}`);
  }
  return value as NotificationImportance;
}

function toScheduleStatus(value: string): NotificationScheduleStatus {
  if (
    !NOTIFICATION_SCHEDULE_STATUSES.includes(
      value as NotificationScheduleStatus
    )
  ) {
    throw new Error(`通知Schedule statusの種別が不正です: ${value}`);
  }
  return value as NotificationScheduleStatus;
}

function toSourceType(value: string | null): NotificationSourceType | null {
  if (value === null) return null;
  if (!NOTIFICATION_SOURCE_TYPES.includes(value as NotificationSourceType)) {
    throw new Error(`通知Sourceの種別が不正です: ${value}`);
  }
  return value as NotificationSourceType;
}

function toStopReason(value: string | null): NotificationStopReason | null {
  return value !== null &&
    NOTIFICATION_STOP_REASONS.includes(value as NotificationStopReason)
    ? (value as NotificationStopReason)
    : null;
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
