import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { eq, sql } from 'drizzle-orm';
import { users, student_description } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { NewStudentInput, StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';

type StudentJoinRow = {
  m_users: typeof users.$inferSelect;
  m_student_description: typeof student_description.$inferSelect;
};

function toEntity(row: StudentJoinRow): StudentEntity {
  return {
    f_users_id: row.m_users.id,
    f_class_room_id: row.m_users.classRoomId as number, // TODO: m_usersからclass_room_idをm_student_description移動させる
    f_display_name: row.m_users.displayName,
    f_uid: row.m_users.uid,
    f_student_id: row.m_student_description.id,
    f_attendance_number: row.m_student_description.attendanceNumber,
    f_student_id_number: row.m_student_description.studentIdNumber,
  };
}

export function createStudentRepository(db: D1Database): IStudentRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(student_description)
        .innerJoin(users, eq(student_description.usersId, users.id))
        .where(eq(student_description.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll(): Promise<StudentEntity[]> {
      const results = await orm
        .select()
        .from(student_description)
        .innerJoin(users, eq(student_description.usersId, users.id))
        .all();

      return results.map(toEntity);
    },

    async findByStudentNum(studentNum: string): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(student_description)
        .innerJoin(users, eq(student_description.usersId, users.id))
        .where(eq(student_description.studentIdNumber, studentNum))
        .get();

      return result ? toEntity(result) : null;
    },

    async create(input: NewStudentInput): Promise<StudentEntity> {
      const [[user], [description]] = await orm.batch([
        orm
          .insert(users)
          .values({
            classRoomId: input.classRoomId,
            displayName: input.displayName,
            uid: input.uid,
          })
          .returning(),
        orm
          .insert(student_description)
          .values({
            usersId: sql`(SELECT last_insert_rowid())`,
            attendanceNumber: input.attendanceNumber,
            studentIdNumber: input.studentIdNumber,
          })
          .returning(),
      ]);

      return toEntity({ m_users: user, m_student_description: description });
    },
  };
}
