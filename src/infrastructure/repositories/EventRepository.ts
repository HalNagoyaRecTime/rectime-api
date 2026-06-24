import { D1Database } from '@cloudflare/workers-types';
import { EventEntity } from '../../domain/entities/Event';
import { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';

function buildWhereClause(options: {
  eventCode?: string;
  eventDate?: string;
  time?: string;
}) {
  const conditions: string[] = [];
  const params: string[] = [];

  if (options.eventCode) {
    conditions.push('e.f_event_code = ?');
    params.push(options.eventCode);
  }

  if (options.eventDate) {
    conditions.push('e.f_event_date = ?');
    params.push(options.eventDate);
  }

  if (options.time) {
    conditions.push('e.f_time = ?');
    params.push(options.time);
  }

  return {
    whereClause:
      conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
  };
}

function transformToEventEntity(raw: Record<string, unknown>): EventEntity {
  return {
    f_event_id: raw.f_event_id as number,
    f_event_code: raw.f_event_code as string,
    f_event_name: raw.f_event_name as string,
    f_event_date: raw.f_event_date as string | null,
    f_time: raw.f_time as string,
    f_duration: raw.f_duration as string,
    f_place: raw.f_place as string,
    f_gather_time: raw.f_gather_time as string,
    f_summary: raw.f_summary as string | null,
  };
}

export function createEventRepository(db: D1Database): IEventRepository {
  return {
    async findAll(options: {
      eventCode?: string;
      eventDate?: string;
      time?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ events: EventEntity[]; total: number }> {
      const { whereClause, params } = buildWhereClause(options);

      let query = `
        SELECT e.*,
               COUNT(en.f_entry_id) as entry_count
        FROM t_events e
        LEFT JOIN t_entries en ON e.f_event_id = en.f_event_id
        ${whereClause}
        GROUP BY e.f_event_id
        ORDER BY e.f_time ASC
      `;

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const countQuery = `SELECT COUNT(*) as total FROM t_events e ${whereClause}`;

      const [events, totalResult] = await Promise.all([
        db
          .prepare(query)
          .bind(...params)
          .all(),
        db
          .prepare(countQuery)
          .bind(...params)
          .first(),
      ]);

      return {
        events: events.results.map(transformToEventEntity),
        total: ((totalResult as Record<string, unknown>)?.total as number) || 0,
      };
    },

    async findByIdWithEntryCount(id: number): Promise<EventEntity | null> {
      const query = `
        SELECT e.*,
               COUNT(en.f_entry_id) as entry_count
        FROM t_events e
        LEFT JOIN t_entries en ON e.f_event_id = en.f_event_id
        WHERE e.f_event_id = ?
        GROUP BY e.f_event_id
      `;

      const result = await db.prepare(query).bind(id).first();

      if (!result) {
        return null;
      }

      return transformToEventEntity(result);
    },

    async findById(id: number): Promise<EventEntity | null> {
      const result = await db
        .prepare('SELECT * FROM t_events WHERE f_event_id = ?')
        .bind(id)
        .first();

      if (!result) {
        return null;
      }

      return transformToEventEntity(result);
    },

    async findByEventCode(eventCode: string): Promise<EventEntity | null> {
      const result = await db
        .prepare('SELECT * FROM t_events WHERE f_event_code = ?')
        .bind(eventCode)
        .first();

      if (!result) {
        return null;
      }

      return transformToEventEntity(result);
    },
  };
}
