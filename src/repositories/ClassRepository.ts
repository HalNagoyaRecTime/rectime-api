import { D1Database } from '@cloudflare/workers-types';
import { ClassEntity } from '../types';
import { ClassRepositoryFunctions } from '../types';

export function createClassRepository(
  db: D1Database
): ClassRepositoryFunctions {
  return {
    async findAll(): Promise<ClassEntity[]> {
      const result = await db
        .prepare('SELECT f_class_id, f_class_name FROM m_classes ORDER BY f_class_id')
        .all();

      return result.results.map(row => ({
        f_class_id: row.f_class_id as number,
        f_class_name: row.f_class_name as string,
      }));
    },
  };
}
