import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { class_rooms } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { ClassRoomEntity } from '../../domain/entities/ClassRoom';
import {
  IClassRoomRepository,
  NewClassRoomInput,
} from '../../domain/interfaces/repositories/IClassRoomRepository';

type ReturnedClassRoomRow = {
  class_room_id: number;
  class_code: string;
  class_name: string;
};

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

    async createMany(inputs: NewClassRoomInput[]): Promise<ClassRoomEntity[]> {
      if (inputs.length === 0) {
        return [];
      }

      const statements = inputs.map(input =>
        db
          .prepare(
            `INSERT INTO class_rooms (class_code, class_name, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             RETURNING class_room_id, class_code, class_name`
          )
          .bind(input.classCode, input.name)
      );

      const results = await db.batch<ReturnedClassRoomRow>(statements);

      return results.map(result => {
        const row = result.results[0];
        if (!row) {
          throw new Error('Failed to create class room');
        }
        return {
          class_room_id: row.class_room_id,
          class_code: row.class_code,
          class_name: row.class_name,
        };
      });
    },
  };
}
