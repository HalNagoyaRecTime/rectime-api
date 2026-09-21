import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationStopRepository } from '../../domain/interfaces/repositories/INotificationStopRepository';

type ScheduleStatusRow = {
  send_status: string;
};

export function createNotificationStopRepository(
  db: D1Database
): INotificationStopRepository {
  return {
    async stopSchedule(scheduleId, stoppedByUserId, reason, now) {
      const allowedStatuses =
        reason === 'source_deleted'
          ? "send_status IN ('resolving', 'sending')"
          : "send_status = 'sending'";
      const schedule = await db
        .prepare(
          'SELECT send_status FROM notification_schedules WHERE notification_schedule_id = ?'
        )
        .bind(scheduleId)
        .first<ScheduleStatusRow>();
      if (!schedule) return 'not_found';
      const isAllowed =
        reason === 'source_deleted'
          ? schedule.send_status === 'resolving' ||
            schedule.send_status === 'sending'
          : schedule.send_status === 'sending';
      if (!isAllowed) return 'not_allowed';

      const results = await db.batch([
        db
          .prepare(
            `UPDATE notification_schedules SET send_status = 'stopped', stopped_at = ?, stopped_by_user_id = ?, reason = ?, updated_at = ? WHERE notification_schedule_id = ? AND ${allowedStatuses}`
          )
          .bind(now, stoppedByUserId, reason, now, scheduleId),
        db
          .prepare(
            "UPDATE notification_push_deliveries SET status = 'stopped', next_retry_at = NULL, updated_at = ? WHERE status IN ('pending', 'retry_wait') AND notification_recipient_id IN (SELECT notification_recipient_id FROM notification_recipients WHERE notification_schedule_id = ?)"
          )
          .bind(now, scheduleId),
      ]);
      if (results[0].meta.changes === 1) return 'stopped';

      const current = await db
        .prepare(
          'SELECT send_status FROM notification_schedules WHERE notification_schedule_id = ?'
        )
        .bind(scheduleId)
        .first<ScheduleStatusRow>();
      return current ? 'not_allowed' : 'not_found';
    },
  };
}
