import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';

interface EventAudienceRow {
  gathering_group_id: number;
}

interface NotificationSummaryRow {
  scheduled_at: string | null;
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}

export function createEventScheduleRepository(
  db: D1Database
): IEventScheduleRepository {
  return {
    async apply(input) {
      const audience =
        input.refresh_notifications && input.notification_enabled
          ? await db
              .prepare(
                `SELECT DISTINCT
                 g.gathering_group_id
               FROM gatherings g
               WHERE g.event_id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM gathering_group_members ggm
                   INNER JOIN firebase_tokens ft
                     ON ft.user_id = ggm.user_id
                    AND ft.is_firebase_active = 1
                   WHERE ggm.gathering_group_id = g.gathering_group_id
                 )
               ORDER BY g.gathering_group_id`
              )
              .bind(input.event_id)
              .all<EventAudienceRow>()
          : { results: [] as EventAudienceRow[] };

      const statements: D1PreparedStatement[] = [buildEventUpdate(db, input)];

      if (input.refresh_notifications) {
        statements.push(
          db
            .prepare(
              `DELETE FROM notification_schedules
             WHERE event_id = ?
               AND send_status = 'draft'
               AND notification_id IN (
                 SELECT notification_id
                 FROM notifications
                 WHERE notification_type = 'event_reminder'
               )`
            )
            .bind(input.event_id)
        );
      }

      if (input.refresh_notifications && input.notification_enabled) {
        for (const row of audience.results) {
          statements.push(
            db
              .prepare(
                `INSERT INTO notifications (notification_type, title, body)
                 VALUES ('event_reminder', ?, ?)`
              )
              .bind(
                `${input.resolved_event_name}開始のお知らせ`,
                `${input.resolved_event_name}の開始時間が近づいています。該当チームは${input.resolved_venue}へ集合してください。`
              ),
            buildScheduleInsert(db, input, row.gathering_group_id)
          );
        }
      }
      if (input.refresh_notifications) {
        statements.push(buildOrphanNotificationCleanup(db));
      }

      await db.batch(statements);
    },

    async getNotificationSummary(eventId) {
      const summary = await db
        .prepare(
          `SELECT
             COALESCE(
               MAX(CASE
                 WHEN ns.send_status IN ('draft', 'sending') THEN ns.send_at
               END),
               MAX(ns.send_at)
             ) AS scheduled_at,
             COUNT(*) AS total,
             SUM(CASE WHEN ns.send_status = 'draft' THEN 1 ELSE 0 END) AS draft,
             SUM(CASE WHEN ns.send_status = 'sending' THEN 1 ELSE 0 END) AS sending,
             SUM(CASE WHEN ns.send_status = 'sent' THEN 1 ELSE 0 END) AS sent,
             SUM(CASE WHEN ns.send_status = 'failed' THEN 1 ELSE 0 END) AS failed
           FROM notification_schedules ns
           INNER JOIN notifications n
             ON n.notification_id = ns.notification_id
           WHERE ns.event_id = ?
             AND n.notification_type = 'event_reminder'`
        )
        .bind(eventId)
        .first<NotificationSummaryRow>();

      return {
        scheduled_at: summary?.scheduled_at ?? null,
        total: Number(summary?.total ?? 0),
        draft: Number(summary?.draft ?? 0),
        sending: Number(summary?.sending ?? 0),
        sent: Number(summary?.sent ?? 0),
        failed: Number(summary?.failed ?? 0),
      };
    },
  };
}

function buildEventUpdate(
  db: D1Database,
  input: Parameters<IEventScheduleRepository['apply']>[0]
): D1PreparedStatement {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const add = (column: string, value: string | null | undefined) => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  add('event_name', input.event_name);
  add('rule_text', input.rule_text);
  add('venue', input.venue);
  add('start_time', input.start_time);
  add('end_time', input.end_time);
  assignments.push('updated_at = CURRENT_TIMESTAMP');
  values.push(input.event_id);

  return db
    .prepare(
      `UPDATE events
       SET ${assignments.join(', ')}
       WHERE event_id = ?`
    )
    .bind(...values);
}

function buildScheduleInsert(
  db: D1Database,
  input: Parameters<IEventScheduleRepository['apply']>[0],
  gatheringGroupId: number
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         importance,
         send_status,
         send_at
       )
       SELECT DISTINCT
         ?,
         ?,
         last_insert_rowid(),
         ft.firebase_token_id,
         2,
         'draft',
         ?
       FROM gathering_group_members ggm
       INNER JOIN firebase_tokens ft
         ON ft.user_id = ggm.user_id
        AND ft.is_firebase_active = 1
       WHERE ggm.gathering_group_id = ?`
    )
    .bind(input.user_id, input.event_id, input.send_at, gatheringGroupId);
}

function buildOrphanNotificationCleanup(db: D1Database): D1PreparedStatement {
  return db.prepare(
    `DELETE FROM notifications
     WHERE notification_type = 'event_reminder'
       AND NOT EXISTS (
         SELECT 1
         FROM notification_schedules
         WHERE notification_schedules.notification_id = notifications.notification_id
       )`
  );
}
