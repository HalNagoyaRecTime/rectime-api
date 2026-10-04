import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type {
  AutomaticNotificationCreationCommand,
  NotificationCreationCommand,
  NotificationCreationOutcome,
} from '../../domain/entities/NotificationCreation';
import type { INotificationCreationRepository } from '../../domain/interfaces/repositories/INotificationCreationRepository';

interface SourceRow {
  notification_id: number;
}

interface AutomaticReminderRow {
  notification_id: number;
  source_hash: string;
  notification_schedule_id: number;
  send_status: string;
  scheduled_by_user_id: number | null;
  started_at: string | null;
  recipients_resolved_at: string | null;
  schedule_count: number;
}

export function createNotificationCreationRepository(
  db: D1Database
): INotificationCreationRepository {
  return {
    async create(command) {
      if (command.audiences.length === 0) {
        throw new Error('Audienceは1件以上必要です');
      }
      return createNotification(db, command);
    },

    async createOrUpdateAutomatic(command) {
      if (command.audiences.length === 0) {
        throw new Error('Audienceは1件以上必要です');
      }
      const exact = await findSourceHash(db, command.source);
      if (exact) return { status: 'already_exists' };

      const previous = await db
        .prepare(
          `SELECT n.notification_id, n.source_hash,
                  s.notification_schedule_id, s.send_status,
                  s.scheduled_by_user_id, s.started_at,
                  s.recipients_resolved_at,
                  (SELECT COUNT(*) FROM notification_schedules all_schedules
                   WHERE all_schedules.notification_id = n.notification_id) AS schedule_count
           FROM notifications n
           INNER JOIN notification_schedules s
             ON s.notification_id = n.notification_id
           WHERE n.source_type = ? AND n.source_id = ?
             AND n.notification_type = 'notification_general'
           ORDER BY n.created_at DESC, n.notification_id DESC
           LIMIT 1`
        )
        .bind(command.source.type, command.source.id)
        .first<AutomaticReminderRow>();

      if (
        previous &&
        previous.schedule_count === 1 &&
        previous.send_status === 'scheduled' &&
        previous.scheduled_by_user_id === null &&
        previous.started_at === null &&
        previous.recipients_resolved_at === null
      ) {
        const results = await db.batch([
          db
            .prepare(
              `UPDATE notifications
               SET push_title = ?, push_body = ?, title = ?, body = ?,
                   source_hash = ?, updated_at = ?
               WHERE notification_id = ? AND source_type = ? AND source_id = ?
                 AND notification_type = 'notification_general' AND source_hash = ?
                 AND EXISTS (
                   SELECT 1 FROM notification_schedules s
                   WHERE s.notification_schedule_id = ?
                     AND s.notification_id = notifications.notification_id
                     AND s.send_status = 'scheduled'
                     AND s.scheduled_by_user_id IS NULL
                     AND s.started_at IS NULL
                     AND s.recipients_resolved_at IS NULL
                     AND NOT EXISTS (
                       SELECT 1 FROM notification_schedules other
                       WHERE other.notification_id = s.notification_id
                         AND other.notification_schedule_id <> s.notification_schedule_id
                     )
                 )`
            )
            .bind(
              command.push_title,
              command.push_body,
              command.detail_title,
              command.detail_body,
              command.source.hash,
              command.now,
              previous.notification_id,
              command.source.type,
              command.source.id,
              previous.source_hash,
              previous.notification_schedule_id
            ),
          db
            .prepare(
              `UPDATE notification_schedules
               SET send_at = ?, updated_at = ?
               WHERE notification_schedule_id = ? AND notification_id = ?
                 AND send_status = 'scheduled' AND scheduled_by_user_id IS NULL
                 AND started_at IS NULL AND recipients_resolved_at IS NULL
                 AND EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.notification_id = notification_schedules.notification_id
                     AND n.source_hash = ?
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM notification_schedules other
                   WHERE other.notification_id = notification_schedules.notification_id
                     AND other.notification_schedule_id <> notification_schedules.notification_schedule_id
                 )`
            )
            .bind(
              command.send_at,
              command.now,
              previous.notification_schedule_id,
              previous.notification_id,
              command.source.hash
            ),
        ]);
        if (results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1) {
          return {
            status: 'updated',
            result: {
              notification_id: previous.notification_id,
              notification_schedule_id: previous.notification_schedule_id,
            },
          };
        }
        if (await findSourceHash(db, command.source)) {
          return { status: 'already_exists' };
        }
      }

      return createNotification(db, command);
    },
  };
}

async function createNotification(
  db: D1Database,
  command: NotificationCreationCommand
): Promise<NotificationCreationOutcome> {
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
      const existing = await findSourceHash(db, command.source);
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
}

async function findSourceHash(
  db: D1Database,
  source: NonNullable<AutomaticNotificationCreationCommand['source']>
): Promise<SourceRow | null> {
  return db
    .prepare(
      `SELECT notification_id FROM notifications
       WHERE source_type = ? AND source_id = ?
         AND notification_type = 'notification_general' AND source_hash = ?`
    )
    .bind(source.type, source.id, source.hash)
    .first<SourceRow>();
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
