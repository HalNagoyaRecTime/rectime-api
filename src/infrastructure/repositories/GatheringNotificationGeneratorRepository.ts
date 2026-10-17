import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import type { D1Database } from '@cloudflare/workers-types';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';

export function createGatheringNotificationGeneratorRepository(
  db: D1Database
): IGatheringNotificationGeneratorRepository {
  const updateSyncFailure = async (gatheringId: number, failed: boolean) => {
    await db
      .prepare(
        `UPDATE notification_schedules SET failed_reason = ?
      WHERE send_status = 'scheduled' AND started_at IS NULL AND scheduled_by_user_id IS NULL
        AND (? = 1 OR failed_reason = ?)
        AND notification_id IN (SELECT notification_id FROM notifications
          WHERE source_type = 'gathering' AND source_id = ? AND notifications.created_at = notification_schedules.created_at)`
      )
      .bind(
        failed ? AUTOMATIC_SYNC_PENDING_REASON : null,
        failed ? 1 : 0,
        AUTOMATIC_SYNC_PENDING_REASON,
        gatheringId
      )
      .run();
  };
  return {
    markSynchronizationFailed: gatheringId =>
      updateSyncFailure(gatheringId, true),
    clearSynchronizationFailure: gatheringId =>
      updateSyncFailure(gatheringId, false),
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
