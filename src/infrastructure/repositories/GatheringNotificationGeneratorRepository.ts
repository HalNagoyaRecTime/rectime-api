import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import type { D1Database } from '@cloudflare/workers-types';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';

export function createGatheringNotificationGeneratorRepository(
  db: D1Database
): IGatheringNotificationGeneratorRepository {
  const holdAutomaticSchedules = async (gatheringId: number) => {
    await db
      .prepare(
        `UPDATE notification_schedules SET failed_reason = ?
         WHERE send_status = 'scheduled' AND started_at IS NULL AND scheduled_by_user_id IS NULL
           AND notification_id IN (
             SELECT notification_id FROM notifications
             WHERE source_type = 'gathering' AND source_id = ?
               AND notifications.created_at = notification_schedules.created_at
           )`
      )
      .bind(AUTOMATIC_SYNC_PENDING_REASON, gatheringId)
      .run();
  };
  return {
    holdAutomaticSchedules,
    async clearAutomaticScheduleHold(gatheringId, expectedGatheringTime) {
      await db
        .prepare(
          `UPDATE notification_schedules SET failed_reason = NULL
           WHERE send_status = 'scheduled' AND started_at IS NULL
             AND scheduled_by_user_id IS NULL
             AND failed_reason = ?
             AND notification_id IN (
               SELECT n.notification_id
               FROM notifications n
               JOIN gatherings g ON g.gathering_id = n.source_id
               WHERE n.source_type = 'gathering'
                 AND n.source_id = ?
                 AND n.created_at = notification_schedules.created_at
                 AND g.gathering_time IS ?
             )`
        )
        .bind(AUTOMATIC_SYNC_PENDING_REASON, gatheringId, expectedGatheringTime)
        .run();
    },
    async findGatheringTime(gatheringId) {
      const row = await db
        .prepare('SELECT gathering_time FROM gatherings WHERE gathering_id = ?')
        .bind(gatheringId)
        .first<{ gathering_time: string }>();
      return row?.gathering_time ?? null;
    },

    async findConfiguredGatheringIds() {
      const rows = await db
        .prepare(
          `SELECT gathering_id
           FROM gatherings
           WHERE gathering_time <> '99:59'
           ORDER BY gathering_time, gathering_id`
        )
        .all<{ gathering_id: number }>();
      return rows.results.map(row => row.gathering_id);
    },
  };
}
