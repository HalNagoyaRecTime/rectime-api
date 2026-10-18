import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationScheduleActionRepository } from '../../domain/interfaces/repositories/INotificationScheduleActionRepository';
import type {
  NotificationScheduleStatus,
  NotificationSourceType,
} from '../../domain/entities/Notification';

interface SnapshotRow {
  notification_id: number;
  source_type: NotificationSourceType | null;
  source_exists: number;
  send_status: NotificationScheduleStatus;
  started_at: string | null;
  recipients_resolved_at: string | null;
  has_recipients: number;
}

export function createNotificationScheduleActionRepository(
  db: D1Database
): INotificationScheduleActionRepository {
  return {
    async findActionSnapshot(scheduleId) {
      const row = await db
        .prepare(
          `SELECT s.notification_id,s.send_status,s.started_at,s.recipients_resolved_at,n.source_type,
        CASE WHEN n.source_type = 'gathering' THEN EXISTS (SELECT 1 FROM gatherings g WHERE g.gathering_id = n.source_id) ELSE 1 END AS source_exists,
        EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_schedule_id = s.notification_schedule_id) AS has_recipients
        FROM notification_schedules s JOIN notifications n USING (notification_id)
        WHERE s.notification_schedule_id = ? AND n.notification_type = 'notification_general'`
        )
        .bind(scheduleId)
        .first<SnapshotRow>();
      return row
        ? {
            ...row,
            source_exists: row.source_exists === 1,
            has_recipients: row.has_recipients === 1,
          }
        : null;
    },
    async createResend(input) {
      // sourceの存在確認とAudienceコピーを同じトランザクションで再検証する。
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO notification_schedules (scheduled_by_user_id,notification_id,send_status,send_at,created_at,updated_at)
          SELECT ?,s.notification_id,'scheduled',?,?,?
          FROM notification_schedules s JOIN notifications n USING (notification_id)
          WHERE s.notification_schedule_id = ? AND n.notification_type = 'notification_general'
            AND (n.source_type IS NULL OR n.source_type <> 'gathering' OR EXISTS (SELECT 1 FROM gatherings g WHERE g.gathering_id = n.source_id))
          RETURNING notification_id,notification_schedule_id`
          )
          .bind(
            input.actor_user_id,
            input.send_at,
            input.now,
            input.now,
            input.schedule_id
          ),
        db
          .prepare(
            `WITH new_schedule AS MATERIALIZED (SELECT last_insert_rowid() AS id)
          INSERT INTO notification_audiences (notification_schedule_id,audience_type,target_id,created_at,updated_at)
          SELECT new_schedule.id,a.audience_type,a.target_id,?,?
          FROM notification_audiences a CROSS JOIN new_schedule
          WHERE a.notification_schedule_id = ? AND changes() = 1`
          )
          .bind(input.now, input.now, input.schedule_id),
      ]);
      const created = results[0].results[0] as
        | { notification_id: number; notification_schedule_id: number }
        | undefined;
      if (created) return { status: 'created', ...created };
      const snapshot = await this.findActionSnapshot(input.schedule_id);
      return { status: snapshot ? 'not_allowed' : 'not_found' };
    },
    async cancelUnstarted(scheduleId) {
      const result = await db
        .prepare(
          `DELETE FROM notification_schedules
        WHERE notification_schedule_id = ? AND started_at IS NULL AND send_status = 'scheduled' AND recipients_resolved_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM notification_recipients r WHERE r.notification_schedule_id = notification_schedules.notification_schedule_id)
          AND EXISTS (SELECT 1 FROM notifications n WHERE n.notification_id = notification_schedules.notification_id AND n.notification_type = 'notification_general')
        RETURNING notification_schedule_id`
        )
        .bind(scheduleId)
        .first<{ notification_schedule_id: number }>();
      if (result) return 'deleted';
      return (await this.findActionSnapshot(scheduleId))
        ? 'not_allowed'
        : 'not_found';
    },
  };
}
