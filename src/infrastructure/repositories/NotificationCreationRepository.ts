import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type {
  NotificationCreationCommand,
  NotificationCreationOutcome,
} from '../../domain/entities/NotificationCreation';
import type { INotificationCreationRepository } from '../../domain/interfaces/repositories/INotificationCreationRepository';

interface SourceRow {
  notification_id: number;
}

export function createNotificationCreationRepository(
  db: D1Database
): INotificationCreationRepository {
  return {
    async create(command): Promise<NotificationCreationOutcome> {
      if (command.audiences.length === 0) {
        throw new Error('Audienceは1件以上必要です');
      }

      const audiencesJson = JSON.stringify(
        command.audiences.map(target => ({
          type: target.type,
          target_id: target.target_id,
        }))
      );
      const scheduleInsert = command.legacy_schedule
        ? db
            .prepare(
              `INSERT INTO notification_schedules (
                 created_user_id, scheduled_by_user_id, event_id, notification_id,
                 importance, send_status, send_at, created_at, updated_at
               ) VALUES (?, ?, NULL, last_insert_rowid(), ?, 'scheduled', ?, ?, ?)
               RETURNING notification_schedule_id`
            )
            .bind(
              command.legacy_schedule.created_user_id,
              command.scheduled_by_user_id,
              command.legacy_schedule.importance,
              command.send_at,
              command.now,
              command.now
            )
        : db
            .prepare(
              `INSERT INTO notification_schedules (
                 scheduled_by_user_id, notification_id, send_status, send_at,
                 created_at, updated_at
               ) VALUES (?, last_insert_rowid(), 'scheduled', ?, ?, ?)
               RETURNING notification_schedule_id`
            )
            .bind(
              command.scheduled_by_user_id,
              command.send_at,
              command.now,
              command.now
            );

      let results: D1Result[];
      try {
        results = await db.batch([
          db
            .prepare(
              `INSERT INTO notifications (
                 created_by_user_id, push_title, push_body, notification_type,
                 title, body, importance, source_type, source_id, source_hash,
                 created_at, updated_at
               ) VALUES (?, ?, ?, 'notification_general', ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING notification_id`
            )
            .bind(
              command.created_by_user_id,
              command.push_title,
              command.push_body,
              command.detail_title,
              command.detail_body,
              command.importance,
              command.source?.type ?? null,
              command.source?.id ?? null,
              command.source?.hash ?? null,
              command.now,
              command.now
            ),
          scheduleInsert,
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
      } catch (error) {
        if (command.source && isNotificationSourceConflict(error)) {
          const existing = await db
            .prepare(
              `SELECT notification_id FROM notifications
               WHERE source_type = ? AND source_id = ?
                 AND notification_type = 'notification_general'
                 AND source_hash = ?`
            )
            .bind(command.source.type, command.source.id, command.source.hash)
            .first<SourceRow>();
          if (existing) return { status: 'already_exists' };
        }
        throw error;
      }

      const notificationId = getReturnedId(results[0], 'notification_id');
      const scheduleId = getReturnedId(results[1], 'notification_schedule_id');
      if (notificationId === null || scheduleId === null) {
        throw new Error('通知の作成結果が不完全です');
      }

      return {
        status: 'created',
        result: {
          notification_id: notificationId,
          notification_schedule_id: scheduleId,
        },
      };
    },
  };
}

function isNotificationSourceConflict(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return (
    message.includes('unique constraint failed') &&
    message.includes('notifications.source_type') &&
    message.includes('notifications.source_id') &&
    message.includes('notifications.notification_type') &&
    message.includes('notifications.source_hash')
  );
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

export type { NotificationCreationCommand };
