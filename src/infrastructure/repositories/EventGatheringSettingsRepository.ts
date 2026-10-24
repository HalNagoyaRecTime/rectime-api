import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, exists, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import * as schema from '../database/schema';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import {
  events,
  gathering_group_members,
  gathering_spots,
  gatherings,
  notification_schedules,
  notifications,
} from '../database/schema';

// drizzle のクエリ(update / delete)も手書きのSQLも、toSQL() でSQLと値に変換できる。
interface SqlStatement {
  toSQL(): { sql: string; params: unknown[] };
}

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
          eq(gathering_group_members.gatheringId, gatherings.id)
        )
        .where(eq(gatherings.eventId, eventId))
        .groupBy(gatherings.id, gathering_spots.id)
        .orderBy(asc(gatherings.round), asc(gatherings.id))
        .all();
    },

    async apply(
      changeSet: EventGatheringChangeSet,
      options: {
        holdNotificationSyncGatheringIds?: number[];
        expectedLockVersion?: number;
      } = {}
    ): Promise<boolean> {
      // 変更が無い保存は何も書かず、eventsの版も進めない。
      if (
        changeSet.delete_ids.length === 0 &&
        changeSet.updates.length === 0 &&
        changeSet.creates.length === 0
      ) {
        return true;
      }

      // 版番号(expectedLockVersion)が指定された場合は、集合予定を書き換える全ての文を
      // 「eventsの版が取得時点のまま」のときだけ作用させる。最後に置くeventsの
      // 更新(版を進める)を先に置くと、その時点で版が進み、後続の文の条件が外れる。
      // 版が一致しないときは全ての文が0件になり、最後のeventsの更新も0件になる。
      // 呼び出し側はfalseを受け取り、何も書かれていない。
      const expected = options.expectedLockVersion;
      const versionMatches =
        expected === undefined
          ? undefined
          : sql`EXISTS (
              SELECT 1 FROM events
              WHERE event_id = ${changeSet.event_id} AND lock_version = ${expected}
            )`;

      // 更新・削除は event_id も条件に含める。Application Service が対象Eventの
      // 集合予定だけを差分に入れる前提だが、他Eventの行を書き換える経路を
      // DB側でも塞いでおく。
      const ownedBy = (gatheringId: number) =>
        and(
          eq(gatherings.id, gatheringId),
          eq(gatherings.eventId, changeSet.event_id)
        );

      // INSERT ... VALUES には条件を付けられないため、SELECT ... WHERE の形にする。
      // drizzle の batch は生SQLを受け付けないので、他の文もSQLへ変換して
      // db.batch でまとめて実行する。
      const versionMatchesText =
        expected === undefined
          ? '1 = 1'
          : 'EXISTS (SELECT 1 FROM events WHERE event_id = ? AND lock_version = ?)';
      const versionMatchesParams =
        expected === undefined ? [] : [changeSet.event_id, expected];

      // 参加者(gathering_group_members)は消さない。参加者が残っている集合予定の
      // DELETE は外部キー制約で失敗し、batch 全体が取り消される。
      const statements: SqlStatement[] = [
        ...(options.holdNotificationSyncGatheringIds ?? []).map(gatheringId =>
          orm
            .update(notification_schedules)
            .set({
              failedReason: AUTOMATIC_SYNC_PENDING_REASON,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
              and(
                versionMatches,
                eq(notification_schedules.sendStatus, 'scheduled'),
                isNull(notification_schedules.startedAt),
                isNull(notification_schedules.scheduledByUserId),
                exists(
                  orm
                    .select({ notificationId: notifications.notificationId })
                    .from(notifications)
                    .where(
                      and(
                        eq(
                          notifications.notificationId,
                          notification_schedules.notificationId
                        ),
                        eq(notifications.sourceType, 'gathering'),
                        eq(notifications.sourceId, gatheringId),
                        eq(
                          notifications.createdAt,
                          notification_schedules.createdAt
                        )
                      )
                    )
                )
              )
            )
        ),
        ...changeSet.delete_ids.map(gatheringId =>
          orm
            .delete(gatherings)
            .where(and(ownedBy(gatheringId), versionMatches))
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
            .where(and(ownedBy(update.gathering_id), versionMatches))
        ),
        ...changeSet.creates.map((create): SqlStatement => ({
          toSQL: () => ({
            sql: `INSERT INTO gatherings
                      (event_id, round, round_start_time, gathering_time, gathering_spot_id)
                    SELECT ?, ?, ?, ?, ?
                    WHERE ${versionMatchesText}`,
            params: [
              changeSet.event_id,
              create.round,
              create.round_start_time ?? null,
              create.gathering_time,
              create.gathering_spot_id,
              ...versionMatchesParams,
            ],
          }),
        })),
        // 集合設定の保存でもeventsの版を進める。PUT /events/{id} と版を共有するため、
        // 保存後に古い版で送られた一方は409になる。必ず最後に置く。
        orm
          .update(events)
          .set({
            updatedAt: sql`CURRENT_TIMESTAMP`,
            lockVersion: sql`${events.lockVersion} + 1`,
          })
          .where(
            and(
              eq(events.id, changeSet.event_id),
              expected === undefined
                ? undefined
                : eq(events.lockVersion, expected)
            )
          )
          .returning({ id: events.id }),
      ];

      const results = await db.batch<{ event_id: number }>(
        statements.map(statement => {
          const { sql: text, params } = statement.toSQL();
          return db.prepare(text).bind(...params);
        })
      );
      // 最後のeventsの更新が0件なら、版が一致しなかった(またはEventが無い)。
      return (results[results.length - 1]?.results.length ?? 0) > 0;
    },
  };
}
