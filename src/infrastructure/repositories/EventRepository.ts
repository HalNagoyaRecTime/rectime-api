import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, inArray, sql, SQL } from 'drizzle-orm';
import * as schema from '../database/schema';
import {
  event_venues,
  events,
  gatherings,
  gathering_group_members,
  notification_audiences,
} from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import type {
  EventEntity,
  ParticipatingEventEntity,
  EventListOptions,
  EventWithGatheringSummaryEntity,
  EventUpdateInput,
  EventWithVenuesEntity,
  EventWriteInput,
  GatheringSummaryEntity,
} from '../../domain/entities/Event';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import { groupVenuesByEventId, selectEventVenues } from './eventVenues';

// 集合時刻が未設定であることを表すsentinel値。gatherings.gathering_timeのデフォルト。
const UNSET_GATHERING_TIME = '99:59';

const EMPTY_GATHERING_SUMMARY: GatheringSummaryEntity = {
  gathering_count: 0,
  configured_gathering_count: 0,
  first_gathering_time: null,
};

function toEntity(row: typeof events.$inferSelect): EventEntity {
  return {
    event_id: row.id,
    event_name: row.name,
    rule_text: row.ruleText,
    start_time: row.startTime,
    end_time: row.endTime,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    lock_version: row.lockVersion,
  };
}

// 集合の概要の取得クエリ。実行せず、競技本体・実施場所と同じbatchで実行する。
function selectGatheringSummaries(orm: ReturnType<typeof drizzle>, where: SQL) {
  return orm
    .select({
      eventId: gatherings.eventId,
      gatheringCount: count(),
      configuredGatheringCount: sql<number>`COUNT(CASE WHEN ${gatherings.gatheringTime} != ${UNSET_GATHERING_TIME} THEN 1 END)`,
      firstGatheringTime: sql<
        string | null
      >`MIN(CASE WHEN ${gatherings.gatheringTime} != ${UNSET_GATHERING_TIME} THEN ${gatherings.gatheringTime} END)`,
    })
    .from(gatherings)
    .where(where)
    .groupBy(gatherings.eventId);
}

function toGatheringSummaries(
  rows: {
    eventId: number;
    gatheringCount: number;
    configuredGatheringCount: number;
    firstGatheringTime: string | null;
  }[]
): Map<number, GatheringSummaryEntity> {
  const summaries = new Map<number, GatheringSummaryEntity>();
  for (const row of rows) {
    summaries.set(row.eventId, {
      gathering_count: row.gatheringCount,
      configured_gathering_count: row.configuredGatheringCount,
      first_gathering_time: row.firstGatheringTime,
    });
  }
  return summaries;
}

export function createEventRepository(db: D1Database): IEventRepository {
  const orm = drizzle(db, { schema });

  // 本体と実施場所は同じbatchで読む。batchは1つのトランザクションとして実行されるため、
  // 返す lock_version と実施場所は同じ時点の内容になる。
  const findEventWithVenues = async (
    id: number
  ): Promise<EventWithVenuesEntity | null> => {
    const [eventRows, venueRows] = await orm.batch([
      orm.select().from(events).where(eq(events.id, id)),
      selectEventVenues(orm, eq(event_venues.eventId, id)),
    ]);
    const result = eventRows[0];
    if (!result) return null;
    return {
      ...toEntity(result),
      venues: groupVenuesByEventId(venueRows).get(id) ?? [],
    };
  };

  return {
    async exists(id: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, id))
          .get()
      );
    },

    async findAll(
      options: EventListOptions
    ): Promise<{ events: EventWithGatheringSummaryEntity[]; total: number }> {
      const conditions: SQL[] = [];
      if (options.startTime) {
        conditions.push(eq(events.startTime, options.startTime));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // 同じ並び・同じ件数の範囲を、本体の取得と、実施場所・集合の概要の絞り込みで
      // 使う。同じ並びになるよう、start_timeが同じ競技はevent_idで並べる。
      const listed = <
        Q extends {
          limit: (limit: number) => Q;
          offset: (offset: number) => Q;
        },
      >(
        query: Q
      ): Q => {
        let paged = query;
        if (options.limit !== undefined) {
          paged = paged.limit(options.limit);
        }
        if (options.offset) {
          paged = paged.offset(options.offset);
        }
        return paged;
      };
      const listedIds = () =>
        listed(
          orm
            .select({ id: events.id })
            .from(events)
            .where(where)
            .orderBy(asc(events.startTime), asc(events.id))
            .$dynamic()
        );

      // 本体・件数・集合の概要・実施場所を同じbatchで読む。別々に読むと、間に更新が
      // 挟まったときに、返す lock_version と実施場所が別の時点の内容になる。
      const [rows, totalRows, summaryRows, venueRows] = await orm.batch([
        listed(
          orm
            .select()
            .from(events)
            .where(where)
            .orderBy(asc(events.startTime), asc(events.id))
            .$dynamic()
        ),
        orm.select({ total: count() }).from(events).where(where),
        selectGatheringSummaries(orm, inArray(gatherings.eventId, listedIds())),
        selectEventVenues(orm, inArray(event_venues.eventId, listedIds())),
      ]);

      const eventEntities = rows.map(toEntity);
      const summaries = toGatheringSummaries(summaryRows);
      const venuesByEventId = groupVenuesByEventId(venueRows);
      const totalResult = totalRows[0];

      return {
        events: eventEntities.map(event => ({
          ...event,
          venues: venuesByEventId.get(event.event_id) ?? [],
          gathering_summary:
            summaries.get(event.event_id) ?? EMPTY_GATHERING_SUMMARY,
        })),
        total: totalResult?.total ?? 0,
      };
    },

    async findById(id: number): Promise<EventEntity | null> {
      const result = await orm
        .select()
        .from(events)
        .where(eq(events.id, id))
        .get();
      return result ? toEntity(result) : null;
    },

    findWithVenuesById: id => findEventWithVenues(id),

    async findByParticipantUserId(
      userId: number
    ): Promise<ParticipatingEventEntity[]> {
      const rows = await orm
        .selectDistinct({
          gatheringId: gatherings.id,
          id: events.id,
        })
        .from(gathering_group_members)
        .innerJoin(
          gatherings,
          eq(gathering_group_members.gatheringId, gatherings.id)
        )
        .innerJoin(events, eq(gatherings.eventId, events.id))
        .where(eq(gathering_group_members.userId, userId))
        .orderBy(asc(events.startTime), asc(events.id), asc(gatherings.id))
        .all();

      // 本人の集合だけを一括取得し、イベント・集合ごとの追加クエリを作らない。
      const participating = new Map<number, ParticipatingEventEntity>();
      for (const row of rows) {
        const existing = participating.get(row.id);
        if (existing) existing.gathering_ids.push(row.gatheringId);
        else
          participating.set(row.id, {
            event_id: row.id,
            gathering_ids: [row.gatheringId],
          });
      }
      return [...participating.values()];
    },

    async create(event: EventWriteInput): Promise<EventWithVenuesEntity> {
      const [created] = await db.batch<{ event_id: number }>([
        db
          .prepare(
            `INSERT INTO events (event_name, rule_text, start_time, end_time)
             VALUES (?, ?, ?, ?)
             RETURNING event_id`
          )
          .bind(event.name, event.ruleText, event.startTime, event.endTime),
        // last_insert_rowid() は event_venues へ1行挿入するたびに変わるため、
        // 同じbatch内で直前に採番した競技を MAX で参照する。
        db
          .prepare(
            `INSERT INTO event_venues (event_id, venue_id)
             SELECT (SELECT MAX(event_id) FROM events), value
             FROM json_each(?)`
          )
          .bind(JSON.stringify(event.venueIds)),
      ]);
      const eventId = created?.results[0]?.event_id;
      if (eventId === undefined) throw new Error('Failed to create event');
      const withVenues = await findEventWithVenues(eventId);
      if (!withVenues) throw new Error('Failed to create event');
      return withVenues;
    },

    async update(
      id: number,
      event: EventUpdateInput
    ): Promise<EventWithVenuesEntity | null> {
      const venueIdsJson = JSON.stringify(event.venueIds);
      // 版番号(expectedLockVersion)が指定された場合は、取得時点から変更されて
      // いないことを確認する。版番号は更新のたびに必ず1ずつ増えるため、
      // updated_at（秒単位）では区別できない同じ秒内の更新も検出できる。
      //
      // 実施場所の付け替え(event_venues)とeventsの更新は同じbatchで行う。版が
      // 一致しないときにevent_venuesだけが書き換わらないよう、次の順序にしている。
      //   1. event_venues の2文は、eventsの版が一致する行があるときだけ作用する
      //   2. eventsの更新(版を進める)は最後に置く
      // eventsの更新を先に置くと、その時点で版が進み、後続の文の「版が一致する」
      // 条件が外れてしまう。不一致のときは3文とも0件になり、呼び出し側はnullを
      // 受け取る。
      const expected = event.expectedLockVersion ?? null;
      const versionMatches = `EXISTS (
               SELECT 1 FROM events
               WHERE event_id = ? AND (? IS NULL OR lock_version = ?)
             )`;
      const results = await db.batch<{ event_id: number }>([
        db
          .prepare(
            `DELETE FROM event_venues
             WHERE event_id = ?
               AND venue_id NOT IN (SELECT value FROM json_each(?))
               AND ${versionMatches}`
          )
          .bind(id, venueIdsJson, id, expected, expected),
        db
          .prepare(
            `INSERT INTO event_venues (event_id, venue_id)
             SELECT ?, value
             FROM json_each(?)
             WHERE ${versionMatches}
             ON CONFLICT (event_id, venue_id) DO NOTHING`
          )
          .bind(id, venueIdsJson, id, expected, expected),
        db
          .prepare(
            `UPDATE events
             SET event_name = ?,
                 rule_text = ?,
                 start_time = ?,
                 end_time = ?,
                 updated_at = CURRENT_TIMESTAMP,
                 lock_version = lock_version + 1
             WHERE event_id = ?
               AND (? IS NULL OR lock_version = ?)
             RETURNING event_id`
          )
          .bind(
            event.name,
            event.ruleText,
            event.startTime,
            event.endTime,
            id,
            expected,
            expected
          ),
      ]);
      if (!results[2]?.results.length) return null;
      return findEventWithVenues(id);
    },

    async delete(id: number): Promise<boolean> {
      const deleted = await orm
        .delete(events)
        .where(eq(events.id, id))
        .returning({ id: events.id })
        .get();
      return Boolean(deleted);
    },

    async hasReferences(id: number): Promise<boolean> {
      const [gathering, schedule] = await Promise.all([
        orm
          .select({ id: gatherings.id })
          .from(gatherings)
          .where(eq(gatherings.eventId, id))
          .get(),
        orm
          .select({ id: notification_audiences.id })
          .from(notification_audiences)
          .where(
            and(
              eq(notification_audiences.audienceType, 'event'),
              eq(notification_audiences.targetId, id)
            )
          )
          .get(),
      ]);
      return Boolean(gathering || schedule);
    },
  };
}
