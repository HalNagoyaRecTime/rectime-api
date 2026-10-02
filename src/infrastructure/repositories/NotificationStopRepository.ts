import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationStopRepository } from '../../domain/interfaces/repositories/INotificationStopRepository';

export function createNotificationStopRepository(
  db: D1Database
): INotificationStopRepository {
  return {
    async stopSchedule(input) {
      const placeholders = input.allowed_statuses.map(() => '?').join(',');
      const results = await db.batch([
        db
          .prepare(
            `UPDATE notification_schedules
          SET send_status = 'stopped', stopped_at = ?, stopped_by_user_id = ?, reason = ?, updated_at = ?
          WHERE notification_schedule_id = ? AND send_status IN (${placeholders})
            AND EXISTS (SELECT 1 FROM notifications n WHERE n.notification_id = notification_schedules.notification_id AND n.notification_type = 'notification_general')`
          )
          .bind(
            input.now,
            input.stopped_by_user_id,
            input.reason,
            input.now,
            input.schedule_id,
            ...input.allowed_statuses
          ),
        db
          .prepare(
            `UPDATE notification_push_deliveries
          SET status = 'stopped', next_retry_at = NULL, updated_at = ?
          WHERE status IN ('pending','retry_wait')
            AND changes() = 1
            AND notification_recipient_id IN (
              SELECT r.notification_recipient_id FROM notification_recipients r
              JOIN notification_schedules s USING (notification_schedule_id)
              WHERE s.notification_schedule_id = ? AND s.send_status = 'stopped')`
          )
          .bind(input.now, input.schedule_id),
      ]);
      if (results[0].meta.changes === 1) return 'stopped';
      const schedule = await db
        .prepare(
          `SELECT s.notification_schedule_id FROM notification_schedules s
        JOIN notifications n USING (notification_id) WHERE s.notification_schedule_id = ? AND n.notification_type = 'notification_general'`
        )
        .bind(input.schedule_id)
        .first();
      return schedule ? 'not_allowed' : 'not_found';
    },
  };
}
