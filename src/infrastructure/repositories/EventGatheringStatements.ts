import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { EventGatheringChangeSet } from '../../domain/entities/EventGathering';
import { gatherings } from '../database/schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../database/schema';

// 集合予定の変更SQLだけを組み立て、実行は保存処理に委ねる。
export function buildEventGatheringStatements(
  orm: DrizzleD1Database<typeof schema>,
  changeSet: EventGatheringChangeSet
): BatchItem<'sqlite'>[] {
  // 更新・削除は event_id も条件に含める。Application Service が対象Eventの
  // 集合予定だけを差分に入れる前提だが、他Eventの行を書き換える経路を
  // DB側でも塞いでおく。
  const ownedBy = (gatheringId: number) =>
    and(
      eq(gatherings.id, gatheringId),
      eq(gatherings.eventId, changeSet.event_id)
    );

  return [
    ...changeSet.delete_ids.map(gatheringId =>
      orm.delete(gatherings).where(ownedBy(gatheringId))
    ),
    ...changeSet.updates.map(update =>
      orm
        .update(gatherings)
        .set({
          round: update.round,
          roundStartTime: update.round_start_time,
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
        roundStartTime: create.round_start_time,
        gatheringTime: create.gathering_time,
        gatheringSpotId: create.gathering_spot_id,
      })
    ),
  ];
}
