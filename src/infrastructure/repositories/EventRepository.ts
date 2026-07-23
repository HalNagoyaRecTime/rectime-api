import { drizzle } from 'drizzle-orm/d1';
import { and, asc, count, eq, SQL } from 'drizzle-orm';
import * as schema from '../database/schema';
import { events } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import {
  EventEntity,
  EventInformationEntity,
} from '../../domain/entities/Event';
import { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';

function toEntity(row: typeof events.$inferSelect): EventEntity {
  return {
    f_event_id: row.id,
    f_event_code: row.eventCode,
    f_event_name: row.name,
    f_time: row.time,
    f_duration: row.duration,
    f_place: row.place,
    f_gather_time: row.gatherTime,
    f_summary: row.summary,
  };
}

export function createEventRepository(db: D1Database): IEventRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(options: {
      eventCode?: string;
      time?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ events: EventEntity[]; total: number }> {
      const conditions: SQL[] = [];
      if (options.eventCode) {
        conditions.push(eq(events.eventCode, options.eventCode));
      }
      if (options.time) {
        conditions.push(eq(events.time, options.time));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      let query = orm
        .select()
        .from(events)
        .where(where)
        .orderBy(asc(events.time))
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

    async findByEventCode(eventCode: string): Promise<EventEntity | null> {
      const result = await orm
        .select()
        .from(events)
        .where(eq(events.eventCode, eventCode))
        .get();

      return result ? toEntity(result) : null;
    },
    async findEventInformation(): Promise<EventInformationEntity[]> {
      return [
    {
          event_id: 1,
          event_name: '走れ○人○脚',
          rule_text: 'イベント1の概要',
          venue: '集合場所A',
          start_time: '0845',
          end_time: '0905',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(), 
        },
        {
          event_id: 2,
          event_name: 'ガチンコ綱引き',
          rule_text: 'イベント2の概要',
          venue: '集合場所B',
          start_time: '0930',
          end_time: '1000',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    },
  };
}
