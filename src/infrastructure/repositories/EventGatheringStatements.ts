import { and, eq, exists, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { EventGatheringChangeSet } from '../../domain/entities/EventGathering';
import { gathering_group_members, gatherings } from '../database/schema';
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
    // 退会中の参加者(所属を残した学生)の所属は、集合予定と一緒に削除する。
    // 在籍中の参加者が残っていれば、外部キー制約でbatchごと失敗する。
    // 退会中かどうかは参加者ごとに主キーで引く(退会したusersを集めると、
    // インデックスで絞り込めずにusersを全件読むため)。
    ...changeSet.delete_ids.flatMap(gatheringId => [
      orm.delete(gathering_group_members).where(
        and(
          eq(gathering_group_members.gatheringId, gatheringId),
          exists(
            orm
              .select({ id: gatherings.id })
              .from(gatherings)
              .where(ownedBy(gatheringId))
          ),
          sql`NOT EXISTS (
              SELECT 1 FROM users
              WHERE users.user_id = ${gathering_group_members.userId}
                AND users.deletion_status = 'active'
            )`
        )
      ),
      orm.delete(gatherings).where(ownedBy(gatheringId)),
    ]),
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
