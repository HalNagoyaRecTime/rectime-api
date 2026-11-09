import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EventGatheringEntity } from '../../domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import * as schema from '../database/schema';
import {
  gathering_group_members,
  gathering_spots,
  gatherings,
} from '../database/schema';
import { buildEventGatheringStatements } from './EventGatheringStatements';

export function createEventGatheringSettingsRepository(
  db: D1Database
): IEventGatheringSettingsRepository {
  const orm = drizzle(db, { schema });
  return {
    async findByEventId(eventId: number): Promise<EventGatheringEntity[]> {
      // 参加人数は集合予定ごとに個別に数えず、LEFT JOIN + GROUP BY で
      // 1回のクエリに収める。参加者がいない集合予定は0件として残る。
      // 退会中の参加者(所属を残した学生)は、通知の対象と揃えて数えない。
      return orm
        .select({
          gathering_id: gatherings.id,
          round: gatherings.round,
          gathering_time: gatherings.gatheringTime,
          round_start_time: gatherings.roundStartTime,
          gathering_spot_id: gathering_spots.id,
          gathering_spot_name: gathering_spots.name,
          gathering_spot_image_key: gathering_spots.imageKey,
          member_count: count(gathering_group_members.id),
        })
        .from(gatherings)
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .leftJoin(
          gathering_group_members,
          and(
            eq(gathering_group_members.gatheringId, gatherings.id),
            sql`EXISTS (
              SELECT 1 FROM users
              WHERE users.user_id = ${gathering_group_members.userId}
                AND users.deletion_status = 'active'
            )`
          )
        )
        .where(eq(gatherings.eventId, eventId))
        .groupBy(gatherings.id, gathering_spots.id)
        .orderBy(asc(gatherings.round), asc(gatherings.id))
        .all();
    },

    async apply(changeSet) {
      const [first, ...rest] = buildEventGatheringStatements(orm, changeSet);
      if (first) await orm.batch([first, ...rest]);
    },
  };
}
