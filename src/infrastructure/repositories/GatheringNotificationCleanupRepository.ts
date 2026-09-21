import type { D1Database } from '@cloudflare/workers-types';
import type { IGatheringNotificationCleanupRepository } from '../../domain/interfaces/repositories/IGatheringNotificationCleanupRepository';

type GatheringNotificationScheduleRow = {
  notification_id: number;
  schedule_id: number;
  send_status: string;
  started_at: string | null;
};

export function createGatheringNotificationCleanupRepository(
  db: D1Database
): IGatheringNotificationCleanupRepository {
  return {
    async findAutomaticSchedulesByGatheringIds(gatheringIds) {
      if (gatheringIds.length === 0) return [];

      const placeholders = gatheringIds.map(() => '?').join(', ');
      const rows = await db
        .prepare(
          `SELECT s.notification_schedule_id AS schedule_id,
                  s.notification_id,
                  s.send_status,
                  s.started_at
             FROM notification_schedules s
             INNER JOIN notifications n ON n.notification_id = s.notification_id
            WHERE n.source_type = 'gathering'
              AND n.source_id IN (${placeholders})
            ORDER BY s.notification_id, s.notification_schedule_id`
        )
        .bind(...gatheringIds)
        .all<GatheringNotificationScheduleRow>();

      return rows.results.map(row => ({
        notificationId: row.notification_id,
        scheduleId: row.schedule_id,
        sendStatus: row.send_status,
        startedAt: row.started_at,
      }));
    },

    async deleteUnstartedSchedule(scheduleId) {
      const result = await db
        .prepare(
          "DELETE FROM notification_schedules WHERE notification_schedule_id = ? AND started_at IS NULL AND send_status = 'scheduled'"
        )
        .bind(scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async deleteNotificationIfNoSchedules(notificationId) {
      const result = await db
        .prepare(
          "DELETE FROM notifications WHERE notification_id = ? AND source_type = 'gathering' AND NOT EXISTS (SELECT 1 FROM notification_schedules WHERE notification_id = ?)"
        )
        .bind(notificationId, notificationId)
        .run();
      return result.meta.changes === 1;
    },
  };
}
