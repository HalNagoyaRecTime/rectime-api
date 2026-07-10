import { D1Database } from '@cloudflare/workers-types';
import { ClassEntity } from '../../domain/entities/Class';
import { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';

function toEntity(row: Record<string, unknown>): ClassEntity {
  return {
    f_class_room_id: row.f_class_room_id as number,
    f_class_code: row.f_class_code as string,
    f_name: row.f_name as string,
  };
}

export function createClassRepository(db: D1Database): IClassRepository {
  return {
    async findAll(): Promise<ClassEntity[]> {
      const result = await db
        .prepare(
          'SELECT f_class_room_id, f_class_code, f_name FROM m_class_rooms ORDER BY f_class_room_id'
        )
        .all();

      return result.results.map(toEntity);
    },

    async findById(id: number): Promise<ClassEntity | null> {
      const row = await db
        .prepare(
          'SELECT f_class_room_id, f_class_code, f_name FROM m_class_rooms WHERE f_class_room_id = ?'
        )
        .bind(id)
        .first();

      return row ? toEntity(row) : null;
    },
  };
}
