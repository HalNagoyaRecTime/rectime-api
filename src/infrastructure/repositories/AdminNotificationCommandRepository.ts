import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type {
  NotificationDeleteResult,
  NotificationScheduleSnapshot,
  NotificationUserSnapshot,
} from '../../domain/entities/AdminNotificationCommand';
import type { IAdminNotificationCommandRepository } from '../../domain/interfaces/repositories/IAdminNotificationCommandRepository';
import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from '../../domain/entities/Notification';

interface MutationRootRow {
  notification_id: number;
  source_type: string | null;
}

interface MutationScheduleRow {
  notification_schedule_id: number;
  started_at: string | null;
}

interface NotificationRootRow {
  notification_id: number;
  push_title: string;
  push_body: string;
  title: string;
  body: string;
  importance: string;
  source_type: string | null;
  source_id: number | null;
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
  audience_type: string;
  target_id: number | null;
  label: string | null;
  resolved_at: string | null;
}

export function createAdminNotificationCommandRepository(
  db: D1Database
): IAdminNotificationCommandRepository {
  return {
    async areAudienceTargetsAvailable(targets) {
      const tableByType: Record<
        Exclude<NotificationAudienceType, 'all'>,
        string
      > = {
        class_room: 'class_rooms',
        gathering: 'gatherings',
        event: 'events',
        user: 'users',
      };
      const idColumnByType: Record<
        Exclude<NotificationAudienceType, 'all'>,
        string
      > = {
        class_room: 'class_room_id',
        gathering: 'gathering_id',
        event: 'event_id',
        user: 'user_id',
      };

      for (const target of targets) {
        if (target.type === 'all') continue;
        const row = await db
          .prepare(
            'SELECT EXISTS (SELECT 1 FROM ' +
              tableByType[target.type] +
              ' WHERE ' +
              idColumnByType[target.type] +
              ' = ?) AS target_exists'
          )
          .bind(target.target_id)
          .first<{ target_exists: number }>();
        if (row?.target_exists !== 1) return false;
      }
      return true;
    },

    async create(command) {
      const audiencesJson = JSON.stringify(
        command.audiences.map(target => ({
          type: target.type,
          target_id: target.target_id,
        }))
      );
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO notifications (
               created_by_user_id, push_title, push_body, notification_type,
               title, body, importance, source_type, source_id, source_hash,
               created_at, updated_at
             ) VALUES (?, ?, ?, 'notification_general', ?, ?, ?, NULL, NULL, NULL, ?, ?)
             RETURNING notification_id`
          )
          .bind(
            command.actor_user_id,
            command.push_title,
            command.push_body,
            command.detail_title,
            command.detail_body,
            command.importance,
            command.now,
            command.now
          ),
        db
          .prepare(
            `INSERT INTO notification_schedules (
               created_user_id, scheduled_by_user_id, event_id, notification_id,
               importance, send_status, send_at, created_at, updated_at
             ) VALUES (?, ?, NULL, last_insert_rowid(), ?, 'scheduled', ?, ?, ?)
             RETURNING notification_schedule_id`
          )
          .bind(
            command.actor_user_id,
            command.actor_user_id,
            importanceToSchedule(command.importance),
            command.send_at,
            command.now,
            command.now
          ),
        db
          .prepare(
            `WITH target_schedule AS MATERIALIZED (
               SELECT last_insert_rowid() AS notification_schedule_id
             ),
             requested_audiences AS (
               SELECT
                 json_extract(value, '$.type') AS audience_type,
                 json_extract(value, '$.target_id') AS target_id
               FROM json_each(?)
             )
             INSERT INTO notification_audiences (
               notification_schedule_id, audience_type, target_id, created_at, updated_at
             )
             SELECT
               target_schedule.notification_schedule_id,
               requested_audiences.audience_type,
               requested_audiences.target_id,
               ?,
               ?
             FROM target_schedule CROSS JOIN requested_audiences`
          )
          .bind(audiencesJson, command.now, command.now),
      ]);

      const notificationId = getReturnedId(results[0], 'notification_id');
      const scheduleId = getReturnedId(results[1], 'notification_schedule_id');
      const createdAudiences = results[2]?.meta.changes ?? 0;
      if (
        notificationId === null ||
        scheduleId === null ||
        createdAudiences !== command.audiences.length
      ) {
        throw new Error('通知の作成結果が不完全です');
      }

      return {
        notification_id: notificationId,
        notification_schedule_id: scheduleId,
      };
    },

    async findMutationSnapshot(notificationId) {
      const root = await db
        .prepare(
          `SELECT notification_id, source_type
           FROM notifications
           WHERE notification_id = ?
             AND notification_type = 'notification_general'`
        )
        .bind(notificationId)
        .first<MutationRootRow>();
      if (!root) return null;

      const rows = await db
        .prepare(
          `SELECT notification_schedule_id, started_at
           FROM notification_schedules
           WHERE notification_id = ?
           ORDER BY notification_schedule_id`
        )
        .bind(notificationId)
        .all<MutationScheduleRow>();
      return {
        notification_id: root.notification_id,
        source_type: root.source_type as NotificationSourceType | null,
        schedules: rows.results.map(row => ({
          notification_schedule_id: row.notification_schedule_id,
          started_at: row.started_at,
        })),
      };
    },

    async update(command) {
      const assignments: string[] = [];
      const bindings: unknown[] = [];
      addAssignment(assignments, bindings, 'push_title', command.push_title);
      addAssignment(assignments, bindings, 'push_body', command.push_body);
      addAssignment(assignments, bindings, 'title', command.detail_title);
      addAssignment(assignments, bindings, 'body', command.detail_body);
      addAssignment(assignments, bindings, 'importance', command.importance);
      addAssignment(assignments, bindings, 'updated_at', command.updated_at);

      let rootWhere =
        "notification_id = ? AND notification_type = 'notification_general'";
      bindings.push(command.notification_id);
      if (command.requires_unstarted_schedules) {
        rootWhere +=
          ' AND NOT EXISTS (' +
          'SELECT 1 FROM notification_schedules s ' +
          'WHERE s.notification_id = notifications.notification_id ' +
          'AND s.started_at IS NOT NULL)';
      }
      if (command.schedule) {
        rootWhere +=
          ' AND EXISTS (' +
          'SELECT 1 FROM notification_schedules s ' +
          'WHERE s.notification_schedule_id = ? ' +
          'AND s.notification_id = notifications.notification_id)';
        bindings.push(command.schedule.notification_schedule_id);
      }

      const statements = [
        db
          .prepare(
            'UPDATE notifications SET ' +
              assignments.join(', ') +
              ' WHERE ' +
              rootWhere
          )
          .bind(...bindings),
      ];

      if (command.importance !== undefined) {
        statements.push(
          db
            .prepare(
              `UPDATE notification_schedules
               SET importance = ?, updated_at = ?
               WHERE notification_id = ?
                 AND started_at IS NULL
                 AND EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.notification_id = ?
                     AND n.notification_type = 'notification_general'
                 )`
            )
            .bind(
              importanceToSchedule(command.importance),
              command.updated_at,
              command.notification_id,
              command.notification_id
            )
        );
      }

      if (command.schedule?.send_at !== undefined) {
        statements.push(
          db
            .prepare(
              `UPDATE notification_schedules
               SET send_at = ?, updated_at = ?
               WHERE notification_schedule_id = ?
                 AND notification_id = ?
                 AND started_at IS NULL
                 AND EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.notification_id = ?
                     AND n.notification_type = 'notification_general'
                 )`
            )
            .bind(
              command.schedule.send_at,
              command.updated_at,
              command.schedule.notification_schedule_id,
              command.notification_id,
              command.notification_id
            )
        );
      }

      if (command.schedule?.audiences !== undefined) {
        const scheduleId = command.schedule.notification_schedule_id;
        statements.push(
          db
            .prepare(
              `DELETE FROM notification_audiences
               WHERE notification_schedule_id = ?
                 AND EXISTS (
                   SELECT 1 FROM notification_schedules s
                   WHERE s.notification_schedule_id = ?
                     AND s.notification_id = ?
                     AND s.started_at IS NULL
                 )`
            )
            .bind(scheduleId, scheduleId, command.notification_id),
          db
            .prepare(
              `WITH requested_audiences AS (
                 SELECT
                   json_extract(value, '$.type') AS audience_type,
                   json_extract(value, '$.target_id') AS target_id
                 FROM json_each(?)
               )
               INSERT INTO notification_audiences (
                 notification_schedule_id, audience_type, target_id, created_at, updated_at
               )
               SELECT ?, audience_type, target_id, ?, ?
               FROM requested_audiences
               WHERE EXISTS (
                 SELECT 1 FROM notification_schedules s
                 WHERE s.notification_schedule_id = ?
                   AND s.notification_id = ?
                   AND s.started_at IS NULL
               )`
            )
            .bind(
              JSON.stringify(
                command.schedule.audiences.map(target => ({
                  type: target.type,
                  target_id: target.target_id,
                }))
              ),
              scheduleId,
              command.updated_at,
              command.updated_at,
              scheduleId,
              command.notification_id
            )
        );
      }

      const results = await db.batch(statements);
      if ((results[0]?.meta.changes ?? 0) > 0) return 'updated';

      const snapshot = await this.findMutationSnapshot(command.notification_id);
      if (!snapshot) return 'not_found';
      if (
        command.schedule &&
        !snapshot.schedules.some(
          schedule =>
            schedule.notification_schedule_id ===
            command.schedule?.notification_schedule_id
        )
      ) {
        return 'schedule_not_found';
      }
      return 'not_allowed';
    },

    async deleteUnstartedManual(
      notificationId
    ): Promise<NotificationDeleteResult> {
      const snapshot = await this.findMutationSnapshot(notificationId);
      if (!snapshot) return 'not_found';
      if (
        snapshot.source_type !== null ||
        snapshot.schedules.some(schedule => schedule.started_at !== null)
      ) {
        return 'not_allowed';
      }

      const results = await db.batch([
        db
          .prepare(
            `DELETE FROM notification_schedules
             WHERE notification_id = ?
               AND EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.notification_id = ?
                   AND n.notification_type = 'notification_general'
                   AND n.source_type IS NULL
               )
               AND NOT EXISTS (
                 SELECT 1 FROM notification_schedules started
                 WHERE started.notification_id = ?
                   AND started.started_at IS NOT NULL
               )`
          )
          .bind(notificationId, notificationId, notificationId),
        db
          .prepare(
            `DELETE FROM notifications
             WHERE notification_id = ?
               AND notification_type = 'notification_general'
               AND source_type IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM notification_schedules
                 WHERE notification_id = ?
               )`
          )
          .bind(notificationId, notificationId),
      ]);
      if ((results[1]?.meta.changes ?? 0) > 0) return 'deleted';

      const after = await this.findMutationSnapshot(notificationId);
      return after ? 'not_allowed' : 'not_found';
    },

    async findDetail(notificationId) {
      const root = await db
        .prepare(
          `SELECT
             n.notification_id, n.push_title, n.push_body, n.title, n.body,
             n.importance, n.source_type, n.source_id, n.created_by_user_id,
             creator.user_name AS created_by_user_name,
             n.created_at, n.updated_at
           FROM notifications n
           LEFT JOIN users creator ON creator.user_id = n.created_by_user_id
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
                     AND d.status = 'failed'
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

      const schedules: NotificationScheduleSnapshot[] = [];
      for (const row of scheduleRows.results) {
        const audienceRows = await db
          .prepare(
            `SELECT
               a.audience_type, a.target_id, a.resolved_at,
               CASE
                 WHEN a.audience_type = 'class_room' THEN cr.class_name
                 WHEN a.audience_type = 'gathering' THEN gs.gathering_spot_name
                 WHEN a.audience_type = 'event' THEN e.event_name
                 WHEN a.audience_type = 'user' THEN target_user.user_name
                 ELSE NULL
               END AS label
             FROM notification_audiences a
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
             WHERE a.notification_schedule_id = ?
             ORDER BY a.notification_audience_id`
          )
          .bind(row.notification_schedule_id)
          .all<AudienceRow>();

        schedules.push({
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
          audiences: audienceRows.results.map(audience => ({
            type: audience.audience_type as NotificationAudienceType,
            target_id: audience.target_id,
            label: audience.label,
            resolved_at: audience.resolved_at,
          })),
          recipient_count: row.recipient_count,
          success_count: row.success_count,
          failed_count: row.failed_count,
          no_push_target_count: row.no_push_target_count,
        });
      }

      return {
        notification_id: root.notification_id,
        push_title: root.push_title,
        push_body: root.push_body,
        detail_title: root.title,
        detail_body: root.body,
        importance: root.importance as NotificationImportance,
        source_type: root.source_type as NotificationSourceType | null,
        source_id: root.source_id,
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

function importanceToSchedule(importance: NotificationImportance): number {
  switch (importance) {
    case 'low':
      return 1;
    case 'normal':
      return 2;
    case 'high':
      return 3;
  }
}
function addAssignment(
  assignments: string[],
  bindings: unknown[],
  column: string,
  value: unknown
): void {
  if (value === undefined) return;
  assignments.push(column + ' = ?');
  bindings.push(value);
}

function getReturnedId(
  result: D1Result | undefined,
  key: string
): number | null {
  const row = result?.results[0] as Record<string, unknown> | undefined;
  const returned = row?.[key];
  if (typeof returned === 'number' && returned > 0) return returned;
  const lastRowId = result?.meta.last_row_id;
  return typeof lastRowId === 'number' && lastRowId > 0 ? lastRowId : null;
}

function toUserSnapshot(
  userId: number | null,
  userName: string | null
): NotificationUserSnapshot | null {
  if (userId === null || userName === null) return null;
  return { user_id: userId, user_name: userName };
}
