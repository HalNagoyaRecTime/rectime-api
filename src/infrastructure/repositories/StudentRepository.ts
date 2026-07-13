import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { students, users } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';

type StudentJoinRow = {
  students: typeof students.$inferSelect;
  users: typeof users.$inferSelect;
};

function toEntity(row: StudentJoinRow): StudentEntity {
  return {
    student_id: row.students.id,
    user_id: row.users.id,
    user_name: row.users.userName,
    class_room_id: row.students.classRoomId,
    attendance_number: row.students.attendanceNumber,
    student_id_number: row.students.studentIdNumber,
  };
}

export function createStudentRepository(db: D1Database): IStudentRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(students.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll(): Promise<StudentEntity[]> {
      const results = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .all();

      return results.map(toEntity);
    },

    async findByStudentNum(studentNum: string): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(students.studentIdNumber, studentNum))
        .get();

      return result ? toEntity(result) : null;
    },
  };
}
