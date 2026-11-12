import { and, eq, exists, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type {
  EventGatheringChangeSet,
  GatheringMemberAssignment,
} from '../../domain/entities/EventGathering';
import { gathering_group_members, gatherings, users } from '../database/schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../database/schema';

type Orm = DrizzleD1Database<typeof schema>;

function deleteAllMembersOfEvent(orm: Orm, eventId: number) {
  return orm
    .delete(gathering_group_members)
    .where(
      inArray(
        gathering_group_members.gatheringId,
        orm
          .select({ id: gatherings.id })
          .from(gatherings)
          .where(eq(gatherings.eventId, eventId))
      )
    );
}

// D1はバインド変数が1クエリ100個まで。参加者を100人ずつ分けると文の数が
// 増えるため、分けない。
// 確認から書き込みまでの間に退会したユーザーを入れないよう、ここでも絞る。
function insertAssignedMembers(
  orm: Orm,
  eventId: number,
  assignment: GatheringMemberAssignment
) {
  return orm.insert(gathering_group_members).select(
    orm
      .select({
        id: sql<number | null>`null`.as('gathering_group_member_id'),
        gatheringId: gatherings.id,
        userId: users.id,
        createdAt: sql<string>`CURRENT_TIMESTAMP`.as('created_at'),
        updatedAt: sql<string>`CURRENT_TIMESTAMP`.as('updated_at'),
      })
      .from(gatherings)
      .innerJoin(
        users,
        and(
          inArray(
            users.id,
            sql`(SELECT value FROM json_each(${JSON.stringify(assignment.user_ids)}))`
          ),
          eq(users.deletionStatus, 'active')
        )
      )
      .where(
        and(
          eq(gatherings.eventId, eventId),
          eq(gatherings.round, assignment.round),
          eq(gatherings.gatheringTime, assignment.gathering_time),
          eq(gatherings.gatheringSpotId, assignment.gathering_spot_id)
        )
      )
  );
}

// 集合予定の変更SQLだけを組み立て、実行は保存処理に委ねる。
export function buildEventGatheringStatements(
  orm: Orm,
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
  const assignments = changeSet.member_assignments;

  return [
    // 参加者を置き換えるときは、集合予定の削除より先に全参加者を外す。
    // 参加者の残る集合予定は外部キー制約で削除できないため。
    ...(assignments ? [deleteAllMembersOfEvent(orm, changeSet.event_id)] : []),
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
    ...(assignments ?? [])
      .filter(assignment => assignment.user_ids.length > 0)
      .map(assignment =>
        insertAssignedMembers(orm, changeSet.event_id, assignment)
      ),
  ];
}
