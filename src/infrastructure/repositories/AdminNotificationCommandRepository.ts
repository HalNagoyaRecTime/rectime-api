import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type { NotificationDeleteResult } from '../../domain/entities/AdminNotificationCommand';
import type { IAdminNotificationCommandRepository } from '../../domain/interfaces/repositories/IAdminNotificationCommandRepository';
import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationSourceType,
} from '../../domain/entities/Notification';

interface MutationRootRow {
  notification_id: number;
  source_type: string | null;
}

interface MutationScheduleRow {
  notification_schedule_id: number;
  started_at: string | null;
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
      if (command.audiences.length === 0) {
        throw new Error('Audienceは1件以上必要です');
      }

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
      if (notificationId === null || scheduleId === null) {
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
      const scheduleUnstartedGuard = command.requires_unstarted_schedules
        ? buildUnstartedSchedulesGuard('notification_schedules.notification_id')
        : '';
      const audienceUnstartedGuard = command.requires_unstarted_schedules
        ? buildUnstartedSchedulesGuard('s.notification_id')
        : '';
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
          ' ' + buildUnstartedSchedulesGuard('notifications.notification_id');
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
                 ${scheduleUnstartedGuard}
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
                 ${scheduleUnstartedGuard}
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
                     ${audienceUnstartedGuard}
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
                   ${audienceUnstartedGuard}
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
  };
}

function buildUnstartedSchedulesGuard(
  notificationIdExpression: string
): string {
  return `AND NOT EXISTS (
    SELECT 1 FROM notification_schedules started
    WHERE started.notification_id = ${notificationIdExpression}
      AND started.started_at IS NOT NULL
  )`;
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
