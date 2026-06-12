import { D1Database } from '@cloudflare/workers-types';
import { ClassEntity } from '../types';
import { ClassRepositoryFunctions } from '../types';

export function createClassRepository(
  db: D1Database
): ClassRepositoryFunctions {
  return {
    async findAll(): Promise<ClassEntity[]> {
      const result = await db
        .prepare('SELECT f_class_room_id, f_class_code, f_name FROM m_class_rooms ORDER BY f_class_room_id')
        .all();

      return result.results.map(row => ({
        f_class_room_id: row.f_class_room_id as number,
        f_class_code: row.f_class_code as string,
        f_name: row.f_name as string,
      }));
    },
  };
}
