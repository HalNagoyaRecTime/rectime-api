import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle } from 'drizzle-orm/d1';
import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import * as schema from '../database/schema';
import {
  gathering_group_members,
  gathering_spots,
  gatherings,
} from '../database/schema';

export function createEventGatheringSettingsRepository(
  db: D1Database
): IEventGatheringSettingsRepository {
  const orm = drizzle(db, { schema });

  return {
    async findByEventId(eventId: number): Promise<EventGatheringEntity[]> {
      // 参加人数は集合予定ごとに個別に数えず、LEFT JOIN + GROUP BY で
      // 1回のクエリに収める。参加者がいない集合予定は0件として残る。
      return orm
        .select({
          gathering_id: gatherings.id,
          round: gatherings.round,
          gathering_time: gatherings.gatheringTime,
          gathering_spot_id: gathering_spots.id,
          gathering_spot_name: gathering_spots.name,
          member_count: count(gathering_group_members.id),
        })
        .from(gatherings)
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .leftJoin(
          gathering_group_members,
          eq(gathering_group_members.gatheringId, gatherings.id)
        )
        .where(eq(gatherings.eventId, eventId))
        .groupBy(gatherings.id, gathering_spots.id)
        .orderBy(
          asc(gatherings.round),
          asc(gatherings.gatheringTime),
          asc(gatherings.id)
        )
        .all();
    },

    async apply(changeSet: EventGatheringChangeSet): Promise<void> {
      // 更新・削除は event_id も条件に含める。Application Service が対象Eventの
      // 集合予定だけを差分に入れる前提だが、他Eventの行を書き換える経路を
      // DB側でも塞いでおく。
      const ownedBy = (gatheringId: number) =>
        and(
          eq(gatherings.id, gatheringId),
          eq(gatherings.eventId, changeSet.event_id)
        );

      // 参加者(gathering_group_members)は消さない。参加者が残っている集合予定の
      // DELETE は外部キー制約で失敗し、batch 全体が取り消される。
      const statements: BatchItem<'sqlite'>[] = [
        ...changeSet.delete_ids.map(gatheringId =>
          orm.delete(gatherings).where(ownedBy(gatheringId))
        ),
        ...changeSet.updates.map(update =>
          orm
            .update(gatherings)
            .set({
              round: update.round,
              gatheringTime: update.gathering_time,
              gatheringSpotId: update.gathering_spot_id,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(ownedBy(update.gathering_id))
        ),
        ...changeSet.creates.map(create =>
          orm.insert(gatherings).values({
            eventId: changeSet.event_id,
            round: create.round,
            gatheringTime: create.gathering_time,
            gatheringSpotId: create.gathering_spot_id,
          })
        ),
      ];

      const [first, ...rest] = statements;
      if (!first) return;
      await orm.batch([first, ...rest]);
    },
  };
}
