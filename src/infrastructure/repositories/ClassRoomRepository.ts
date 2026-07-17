import { D1Database } from '@cloudflare/workers-types';
import { ClassRoomEntity } from '../../domain/entities/ClassRoom';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';

export function createClassRoomRepository(
  db: D1Database
): IClassRoomRepository {
  return {
    async findAll(): Promise<ClassRoomEntity[]> {
      const result = await db
        .prepare(
          'SELECT class_room_id, class_code, class_name FROM class_rooms ORDER BY class_room_id'
        )
        .all();

      return result.results.map(row => ({
        f_class_room_id: row.class_room_id as number,
        f_class_code: row.class_code as string,
        f_class_name: row.class_name as string,
      }));
    },
  };
}
