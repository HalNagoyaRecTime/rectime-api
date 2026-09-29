import type { D1Database } from '@cloudflare/workers-types';
import type {
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

interface NotificationRootRow {
  notification_id: number;
  push_title: string;
  push_body: string;
  title: string;
  body: string;
  importance: string;
  source_type: string | null;
  source_id: number | null;
  source_label: string | null;
  created_by_user_id: number | null;
  created_by_user_name: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationScheduleRow {
  notification_schedule_id: number;
  send_at: string;
  send_status: string;
  reason: string | null;
  stopped_at: string | null;
  stopped_by_user_id: number | null;
  stopped_by_user_name: string | null;
  scheduled_by_user_id: number | null;
  scheduled_by_user_name: string | null;
  created_at: string;
  recipients_resolved_at: string | null;
  recipient_count: number;
  success_count: number;
  failed_count: number;
  no_push_target_count: number;
}

interface AudienceRow {
  notification_schedule_id: number;
  audience_type: string;
  target_id: number | null;
  label: string | null;
  resolved_at: string | null;
}

export function createAdminNotificationQueryRepository(
  db: D1Database
): IAdminNotificationQueryRepository {
  return {
    async findDetail(notificationId) {
      const root = await db
        .prepare(
          `SELECT
             n.notification_id, n.push_title, n.push_body, n.title, n.body,
             n.importance, n.source_type, n.source_id,
             source_spot.gathering_spot_name AS source_label,
             n.created_by_user_id,
             creator.user_name AS created_by_user_name,
             n.created_at, n.updated_at
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
        .first<NotificationRootRow>();
      if (!root) return null;

      const scheduleRows = await db
        .prepare(
          `SELECT
             s.notification_schedule_id, s.send_at, s.send_status, s.reason,
             s.stopped_at, s.stopped_by_user_id,
             stopped_by.user_name AS stopped_by_user_name,
             s.scheduled_by_user_id,
             scheduled_by.user_name AS scheduled_by_user_name,
             s.created_at, s.recipients_resolved_at,
             (SELECT COUNT(*)
                FROM notification_recipients r
               WHERE r.notification_schedule_id = s.notification_schedule_id
             ) AS recipient_count,
             (SELECT COUNT(*)
                FROM notification_recipients r
               WHERE r.notification_schedule_id = s.notification_schedule_id
                 AND EXISTS (
                   SELECT 1 FROM notification_push_deliveries d
                   WHERE d.notification_recipient_id = r.notification_recipient_id
                     AND d.status = 'sent'
                 )
             ) AS success_count,
             (SELECT COUNT(*)
                FROM notification_recipients r
               WHERE r.notification_schedule_id = s.notification_schedule_id
                 AND NOT EXISTS (
                   SELECT 1 FROM notification_push_deliveries d
                   WHERE d.notification_recipient_id = r.notification_recipient_id
                     AND d.status = 'sent'
                 )
                 AND EXISTS (
                   SELECT 1 FROM notification_push_deliveries d
                   WHERE d.notification_recipient_id = r.notification_recipient_id
                 )
             ) AS failed_count,
             (SELECT COUNT(*)
                FROM notification_recipients r
               WHERE r.notification_schedule_id = s.notification_schedule_id
                 AND NOT EXISTS (
                   SELECT 1 FROM notification_push_deliveries d
                   WHERE d.notification_recipient_id = r.notification_recipient_id
                 )
             ) AS no_push_target_count
           FROM notification_schedules s
           LEFT JOIN users stopped_by
             ON stopped_by.user_id = s.stopped_by_user_id
           LEFT JOIN users scheduled_by
             ON scheduled_by.user_id = s.scheduled_by_user_id
           WHERE s.notification_id = ?
           ORDER BY s.notification_schedule_id`
        )
        .bind(notificationId)
        .all<NotificationScheduleRow>();

      const audienceRows = await db
        .prepare(
          `SELECT
             a.notification_schedule_id, a.audience_type, a.target_id,
             a.resolved_at,
             CASE
               WHEN a.audience_type = 'class_room' THEN cr.class_name
               WHEN a.audience_type = 'gathering' THEN gs.gathering_spot_name
               WHEN a.audience_type = 'event' THEN e.event_name
               WHEN a.audience_type = 'user' THEN target_user.user_name
               ELSE NULL
             END AS label
           FROM notification_audiences a
           JOIN notification_schedules s
             ON s.notification_schedule_id = a.notification_schedule_id
           LEFT JOIN class_rooms cr
             ON a.audience_type = 'class_room'
            AND cr.class_room_id = a.target_id
           LEFT JOIN gatherings g
             ON a.audience_type = 'gathering'
            AND g.gathering_id = a.target_id
           LEFT JOIN gathering_spots gs
             ON gs.gathering_spot_id = g.gathering_spot_id
           LEFT JOIN events e
             ON a.audience_type = 'event'
            AND e.event_id = a.target_id
           LEFT JOIN users target_user
             ON a.audience_type = 'user'
            AND target_user.user_id = a.target_id
           WHERE s.notification_id = ?
           ORDER BY a.notification_schedule_id, a.notification_audience_id`
        )
        .bind(notificationId)
        .all<AudienceRow>();
      const audiencesBySchedule = new Map<
        number,
        NotificationAudienceSnapshot[]
      >();
      for (const audience of audienceRows.results) {
        const audiences =
          audiencesBySchedule.get(audience.notification_schedule_id) ?? [];
        audiences.push({
          type: audience.audience_type as NotificationAudienceType,
          target_id: audience.target_id,
          label: audience.label,
          resolved_at: audience.resolved_at,
        });
        audiencesBySchedule.set(audience.notification_schedule_id, audiences);
      }

      const schedules: NotificationScheduleSnapshot[] =
        scheduleRows.results.map(row => ({
          notification_schedule_id: row.notification_schedule_id,
          send_at: row.send_at,
          status: row.send_status as NotificationScheduleStatus,
          stop_reason: row.reason as NotificationStopReason | null,
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
          audiences:
            audiencesBySchedule.get(row.notification_schedule_id) ?? [],
          recipient_count: row.recipient_count,
          success_count: row.success_count,
          failed_count: row.failed_count,
          no_push_target_count: row.no_push_target_count,
        }));

      return {
        notification_id: root.notification_id,
        push_title: root.push_title,
        push_body: root.push_body,
        detail_title: root.title,
        detail_body: root.body,
        importance: root.importance as NotificationImportance,
        source_type: root.source_type as NotificationSourceType | null,
        source_id: root.source_id,
        source_label: root.source_label,
        created_by: toUserSnapshot(
          root.created_by_user_id,
          root.created_by_user_name
        ),
        created_at: root.created_at,
        updated_at: root.updated_at,
        schedules,
      };
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
