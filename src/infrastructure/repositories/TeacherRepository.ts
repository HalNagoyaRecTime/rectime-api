import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { teachers, users } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { TeacherEntity } from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';

type TeacherJoinRow = {
  teachers: typeof teachers.$inferSelect;
  users: typeof users.$inferSelect;
};

function toEntity(row: TeacherJoinRow): TeacherEntity {
  return {
    teacher_id: row.teachers.id,
    user_id: row.users.id,
    user_name: row.users.userName,
  };
}

export function createTeacherRepository(db: D1Database): ITeacherRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<TeacherEntity | null> {
      const result = await orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(teachers.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll(): Promise<TeacherEntity[]> {
      const results = await orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .all();

      return results.map(toEntity);
    },
  };
}
