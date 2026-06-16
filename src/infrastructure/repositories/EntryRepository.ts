import { D1Database } from '@cloudflare/workers-types';
import { EntryEntity } from '../../domain/entities/Entry';
import { IEntryRepository } from '../../domain/interfaces/repositories/IEntryRepository';

function transformToEntryEntity(raw: Record<string, unknown>): EntryEntity {
  return {
    f_entry_id: raw.f_entry_id as number,
    f_student_id: raw.f_student_id as number,
    f_event_id: raw.f_event_id as number,
  };
}

export function createEntryRepository(db: D1Database): IEntryRepository {
  return {
    async findAll(options: {
      studentId?: number;
      eventId?: number;
      limit?: number;
      offset?: number;
    }): Promise<{ entries: EntryEntity[]; total: number }> {
      const conditions: string[] = [];
      const params: number[] = [];

      if (options.studentId) {
        conditions.push('f_student_id = ?');
        params.push(options.studentId);
      }

      if (options.eventId) {
        conditions.push('f_event_id = ?');
        params.push(options.eventId);
      }

      const whereClause =
        conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      let query = `SELECT * FROM t_entries ${whereClause} ORDER BY f_entry_id`;

      if (options.limit) {
        query += ` LIMIT ${options.limit}`;
      }
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }

      const countQuery = `SELECT COUNT(*) as total FROM t_entries ${whereClause}`;

      const [entries, totalResult] = await Promise.all([
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
        entries: entries.results.map(transformToEntryEntity),
        total:
          ((totalResult as Record<string, unknown>)?.total as number) || 0,
      };
    },

    async findById(id: number): Promise<EntryEntity | null> {
      const result = await db
        .prepare('SELECT * FROM t_entries WHERE f_entry_id = ?')
        .bind(id)
        .first();

      if (!result) {
        return null;
      }

      return transformToEntryEntity(result);
    },
  };
}
