import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { student_master } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import {
  NewStudentMasterRow,
  StudentMasterEntity,
} from '../../domain/entities/StudentMaster';
import { IStudentMasterRepository } from '../../domain/interfaces/repositories/IStudentMasterRepository';

const INSERT_CHUNK_SIZE = 200;

function toEntity(
  row: typeof student_master.$inferSelect
): StudentMasterEntity {
  return {
    student_master: row.id,
    class_code: row.classCode,
    attendance_number: row.attendanceNumber,
    student_id_number: row.studentIdNumber,
    user_name: row.userName,
    created_at: row.createdAt,
  };
}

export function createStudentMasterRepository(
  db: D1Database
): IStudentMasterRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(): Promise<StudentMasterEntity[]> {
      const results = await orm.select().from(student_master).all();
      return results.map(toEntity);
    },

    async bulkCreate(
      rows: NewStudentMasterRow[]
    ): Promise<StudentMasterEntity[]> {
      const created: StudentMasterEntity[] = [];

      for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
        const inserted = await orm
          .insert(student_master)
          .values(
            chunk.map(row => ({
              classCode: row.classCode,
              attendanceNumber: row.attendanceNumber,
              studentIdNumber: row.studentIdNumber,
              userName: row.userName,
            }))
          )
          .returning();
        created.push(...inserted.map(toEntity));
      }

      return created;
    },
  };
}
