import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, inArray, sql, SQL } from 'drizzle-orm';
import * as schema from '../database/schema';
import {
  events,
  gatherings,
  gathering_group_members,
  notification_schedules,
} from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import type {
  EventEntity,
  EventListOptions,
  EventWithGatheringSummaryEntity,
  EventWithVenuesEntity,
  EventWriteInput,
  GatheringSummaryEntity,
} from '../../domain/entities/Event';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import { findVenuesByEventIds } from './eventVenues';

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
  };
}

async function findGatheringSummaries(
  orm: ReturnType<typeof drizzle>,
  eventIds: number[]
): Promise<Map<number, GatheringSummaryEntity>> {
  const summaries = new Map<number, GatheringSummaryEntity>();
  if (eventIds.length === 0) {
    return summaries;
  }

  const rows = await orm
    .select({
      eventId: gatherings.eventId,
      gatheringCount: count(),
      configuredGatheringCount: sql<number>`COUNT(CASE WHEN ${gatherings.gatheringTime} != ${UNSET_GATHERING_TIME} THEN 1 END)`,
      firstGatheringTime: sql<
        string | null
      >`MIN(CASE WHEN ${gatherings.gatheringTime} != ${UNSET_GATHERING_TIME} THEN ${gatherings.gatheringTime} END)`,
    })
    .from(gatherings)
    .where(inArray(gatherings.eventId, eventIds))
    .groupBy(gatherings.eventId)
    .all();

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

  const findEventWithVenues = async (
    id: number
  ): Promise<EventWithVenuesEntity | null> => {
    const [result, venuesByEventId] = await Promise.all([
      orm.select().from(events).where(eq(events.id, id)).get(),
      findVenuesByEventIds(orm, [id]),
    ]);
    if (!result) return null;
    return { ...toEntity(result), venues: venuesByEventId.get(id) ?? [] };
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

      let query = orm
        .select()
        .from(events)
        .where(where)
        .orderBy(asc(events.startTime))
        .$dynamic();

      if (options.limit !== undefined) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.offset(options.offset);
      }

      const [rows, totalResult] = await Promise.all([
        query.all(),
        orm.select({ total: count() }).from(events).where(where).get(),
      ]);

      const eventEntities = rows.map(toEntity);
      const eventIds = eventEntities.map(event => event.event_id);
      const [summaries, venuesByEventId] = await Promise.all([
        findGatheringSummaries(orm, eventIds),
        findVenuesByEventIds(orm, eventIds),
      ]);

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
    ): Promise<EventWithVenuesEntity[]> {
      const rows = await orm
        .selectDistinct({
          id: events.id,
          name: events.name,
          ruleText: events.ruleText,
          startTime: events.startTime,
          endTime: events.endTime,
          createdAt: events.createdAt,
          updatedAt: events.updatedAt,
        })
        .from(gathering_group_members)
        .innerJoin(
          gatherings,
          eq(gathering_group_members.gatheringId, gatherings.id)
        )
        .innerJoin(events, eq(gatherings.eventId, events.id))
        .where(eq(gathering_group_members.userId, userId))
        .orderBy(asc(events.startTime))
        .all();

      const eventEntities = rows.map(toEntity);
      const venuesByEventId = await findVenuesByEventIds(
        orm,
        eventEntities.map(event => event.event_id)
      );
      return eventEntities.map(event => ({
        ...event,
        venues: venuesByEventId.get(event.event_id) ?? [],
      }));
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
      event: EventWriteInput
    ): Promise<EventWithVenuesEntity | null> {
      const venueIdsJson = JSON.stringify(event.venueIds);
      const [updated] = await db.batch<{ event_id: number }>([
        db
          .prepare(
            `UPDATE events
             SET event_name = ?,
                 rule_text = ?,
                 start_time = ?,
                 end_time = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?
             RETURNING event_id`
          )
          .bind(event.name, event.ruleText, event.startTime, event.endTime, id),
        db
          .prepare(
            `DELETE FROM event_venues
             WHERE event_id = ?
               AND venue_id NOT IN (SELECT value FROM json_each(?))`
          )
          .bind(id, venueIdsJson),
        db
          .prepare(
            `INSERT INTO event_venues (event_id, venue_id)
             SELECT ?, value
             FROM json_each(?)
             WHERE EXISTS (SELECT 1 FROM events WHERE event_id = ?)
             ON CONFLICT (event_id, venue_id) DO NOTHING`
          )
          .bind(id, venueIdsJson, id),
      ]);
      if (!updated?.results.length) return null;
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
          .select({ id: notification_schedules.id })
          .from(notification_schedules)
          .where(eq(notification_schedules.eventId, id))
          .get(),
      ]);
      return Boolean(gathering || schedule);
    },
  };
}
