import type { D1Database } from '@cloudflare/workers-types';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';

export function createEventScheduleRepository(
  db: D1Database
): IEventScheduleRepository {
  return {
    async apply(input) {
      const statements = [
        db
          .prepare(
            `UPDATE events
             SET start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?`
          )
          .bind(input.start_time, input.end_time, input.event_id),
      ];

      if (!input.notification_enabled) {
        statements.push(
          db
            .prepare(
              `DELETE FROM notification_schedules
               WHERE event_id = ?
                 AND gathering_group_id = ?
                 AND send_status = 'draft'`
            )
            .bind(input.event_id, input.gathering_group_id)
        );
        await db.batch(statements);
        return;
      }

      statements.push(
        db
          .prepare(
            `UPDATE notifications
             SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
             WHERE notification_id IN (
               SELECT notification_id
               FROM notification_schedules
               WHERE event_id = ?
                 AND gathering_group_id = ?
                 AND send_status = 'draft'
             )`
          )
          .bind(
            input.notification_title,
            input.notification_body,
            input.event_id,
            input.gathering_group_id
          ),
        db
          .prepare(
            `INSERT INTO notifications (notification_type, title, body)
             SELECT 'event_reminder', ?, ?
             WHERE NOT EXISTS (
               SELECT 1
               FROM notification_schedules
               WHERE event_id = ?
                 AND gathering_group_id = ?
                 AND send_status = 'draft'
             )`
          )
          .bind(
            input.notification_title,
            input.notification_body,
            input.event_id,
            input.gathering_group_id
          ),
        db
          .prepare(
            `INSERT INTO notification_schedules (
               user_id,
               event_id,
               gathering_group_id,
               notification_id,
               importance,
               send_status,
               send_at
             )
             SELECT ?, ?, ?, last_insert_rowid(), 2, 'draft', ?
             WHERE changes() = 1`
          )
          .bind(
            input.user_id,
            input.event_id,
            input.gathering_group_id,
            input.send_at
          ),
        db
          .prepare(
            `UPDATE notification_schedules
             SET send_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?
               AND gathering_group_id = ?
               AND send_status = 'draft'`
          )
          .bind(input.send_at, input.event_id, input.gathering_group_id),
        db
          .prepare(
            `DELETE FROM notification_schedules
             WHERE event_id = ?
               AND gathering_group_id = ?
               AND send_status = 'draft'
               AND notification_send_schedule_id NOT IN (
                 SELECT MIN(notification_send_schedule_id)
                 FROM notification_schedules
                 WHERE event_id = ?
                   AND gathering_group_id = ?
                   AND send_status = 'draft'
               )`
          )
          .bind(
            input.event_id,
            input.gathering_group_id,
            input.event_id,
            input.gathering_group_id
          )
      );

      await db.batch(statements);
    },
  };
}
