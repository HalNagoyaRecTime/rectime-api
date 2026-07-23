import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { class_rooms } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { ClassRoomEntity } from '../../domain/entities/ClassRoom';
import {
  IClassRoomRepository,
  NewClassRoomInput,
} from '../../domain/interfaces/repositories/IClassRoomRepository';

function toEntity(row: typeof class_rooms.$inferSelect): ClassRoomEntity {
  return {
    class_room_id: row.id,
    class_code: row.classCode,
    class_name: row.name,
  };
}

export function createClassRoomRepository(
  db: D1Database
): IClassRoomRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(): Promise<ClassRoomEntity[]> {
      const result = await orm.select().from(class_rooms).all();

      return result ? result.map(toEntity) : [];
    },

    async create(input: NewClassRoomInput): Promise<ClassRoomEntity> {
      const [created] = await orm
        .insert(class_rooms)
        .values({ classCode: input.classCode, name: input.name })
        .returning();

      if (!created) {
        throw new Error('Failed to create class room');
      }
      return toEntity(created);
    },
  };
}
