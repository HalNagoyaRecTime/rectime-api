import type { D1Database } from '@cloudflare/workers-types';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';

export function createGatheringNotificationGeneratorRepository(
  db: D1Database
): IGatheringNotificationGeneratorRepository {
  return {
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
           ORDER BY gathering_id`
        )
        .all<{ gathering_id: number }>();
      return rows.results.map(row => row.gathering_id);
    },
  };
}
