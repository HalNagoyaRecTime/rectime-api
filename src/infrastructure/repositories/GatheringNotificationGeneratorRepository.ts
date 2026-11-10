import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import type { D1Database } from '@cloudflare/workers-types';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';

export function createGatheringNotificationGeneratorRepository(
  db: D1Database
): IGatheringNotificationGeneratorRepository {
  const holdAutomaticSchedules = async (gatheringId: number) => {
    await db
      // send_statusのindexから引くとほかの集合の予定中の予約もすべて読むため、集合の通知から引く。
      .prepare(
        `UPDATE notification_schedules SET failed_reason = ?
         WHERE +send_status = 'scheduled' AND started_at IS NULL AND scheduled_by_user_id IS NULL
           AND notification_id IN (
             SELECT notification_id FROM notifications
             WHERE source_type = 'gathering' AND source_id = ?
           )
           AND created_at = (
             SELECT n.created_at FROM notifications n
             WHERE n.notification_id = notification_schedules.notification_id
           )`
      )
      .bind(AUTOMATIC_SYNC_PENDING_REASON, gatheringId)
      .run();
  };
  return {
    holdAutomaticSchedules,
    async clearAutomaticScheduleHold(gatheringId, expectedGatheringTime) {
      await db
        // send_statusのindexから引くとほかの集合の予定中の予約もすべて読むため、集合の通知から引く。
        .prepare(
          `UPDATE notification_schedules SET failed_reason = NULL
           WHERE +send_status = 'scheduled' AND started_at IS NULL
             AND scheduled_by_user_id IS NULL
             AND failed_reason = ?
             AND notification_id IN (
               SELECT n.notification_id
               FROM notifications n
               JOIN gatherings g ON g.gathering_id = n.source_id
               WHERE n.source_type = 'gathering'
                 AND n.source_id = ?
                 AND g.gathering_time IS ?
             )
             AND created_at = (
               SELECT n.created_at FROM notifications n
               WHERE n.notification_id = notification_schedules.notification_id
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
