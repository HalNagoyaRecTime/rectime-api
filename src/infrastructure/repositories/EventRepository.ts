import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, sql, SQL } from 'drizzle-orm';
import * as schema from '../database/schema';
import { events } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { EventEntity } from '../../domain/entities/Event';
import { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';

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
    async findAll(options: {
      startTime?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ events: EventEntity[]; total: number }> {
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

    async updateTimes(id, input) {
      const row = await orm
        .update(events)
        .set({
          startTime: input.start_time,
          endTime: input.end_time,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(events.id, id))
        .returning()
        .get();
      return row ? toEntity(row) : null;
    },
  };
}
