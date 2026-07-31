import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, SQL } from 'drizzle-orm';
import * as schema from '../database/schema';
import { events, gatherings, notification_schedules } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import type {
  EventEntity,
  EventListOptions,
  EventWriteInput,
} from '../../domain/entities/Event';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';

function toEntity(row: typeof events.$inferSelect): EventEntity {
  return {
    event_id: row.id,
    event_name: row.name,
    rule_text: row.ruleText,
    venue: row.venue,
    start_time: row.startTime,
    end_time: row.endTime,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createEventRepository(db: D1Database): IEventRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(
      options: EventListOptions
    ): Promise<{ events: EventEntity[]; total: number }> {
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

      return {
        events: rows.map(toEntity),
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

    async create(event: EventWriteInput): Promise<EventEntity> {
      const created = await orm
        .insert(events)
        .values({
          name: event.name,
          ruleText: event.ruleText,
          venue: event.venue,
          startTime: event.startTime,
          endTime: event.endTime,
        })
        .returning()
        .get();
      if (!created) throw new Error('Failed to create event');
      return toEntity(created);
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
