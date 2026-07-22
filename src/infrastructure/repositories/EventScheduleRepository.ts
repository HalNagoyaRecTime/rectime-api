import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';

interface EventAudienceRow {
  gathering_group_id: number;
  gathering_spot_name: string;
}

export function createEventScheduleRepository(
  db: D1Database
): IEventScheduleRepository {
  return {
    async apply(input) {
      const [draftNotifications, audience] = await Promise.all([
        db
          .prepare(
            `SELECT DISTINCT ns.notification_id
             FROM notification_schedules ns
             INNER JOIN notifications n
               ON n.notification_id = ns.notification_id
             WHERE ns.event_id = ?
               AND ns.send_status = 'draft'
               AND n.notification_type = 'event_reminder'`
          )
          .bind(input.event_id)
          .all<{ notification_id: number }>(),
        input.notification_enabled
          ? db
              .prepare(
                `SELECT DISTINCT
                   g.gathering_group_id,
                   gs.gathering_spot_name
                 FROM gatherings g
                 INNER JOIN gathering_spots gs
                   ON gs.gathering_spot_id = g.gathering_spot_id
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
          : Promise.resolve({ results: [] as EventAudienceRow[] }),
      ]);

      const draftNotificationIds = draftNotifications.results.map(
        row => row.notification_id
      );
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `UPDATE events
             SET start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?`
          )
          .bind(input.start_time, input.end_time, input.event_id),
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
          .bind(input.event_id),
      ];
      appendOrphanNotificationCleanup(db, statements, draftNotificationIds);

      if (input.notification_enabled) {
        for (const row of audience.results) {
          statements.push(
            db
              .prepare(
                `INSERT INTO notifications (notification_type, title, body)
                 VALUES ('event_reminder', ?, ?)`
              )
              .bind(
                `${input.event_name}開始のお知らせ`,
                `${input.event_name}の開始時間が近づいています。該当チームは${row.gathering_spot_name}へ集合してください。`
              ),
            buildScheduleInsert(db, input, row.gathering_group_id)
          );
        }
      }

      await db.batch(statements);
    },
  };
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

function appendOrphanNotificationCleanup(
  db: D1Database,
  statements: D1PreparedStatement[],
  notificationIds: number[]
): void {
  if (notificationIds.length === 0) return;
  const placeholders = notificationIds.map(() => '?').join(', ');
  statements.push(
    db
      .prepare(
        `DELETE FROM notifications
         WHERE notification_id IN (${placeholders})
           AND notification_type = 'event_reminder'
           AND NOT EXISTS (
             SELECT 1
             FROM notification_schedules
             WHERE notification_schedules.notification_id = notifications.notification_id
           )`
      )
      .bind(...notificationIds)
  );
}
