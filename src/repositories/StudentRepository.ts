import { D1Database } from '@cloudflare/workers-types';
import { StudentEntity } from '../types/domains/Student';
import { StudentRepositoryFunctions } from '../types/repositories';

export function createStudentRepository(
  db: D1Database
): StudentRepositoryFunctions {
  return {
    async findById(id: number): Promise<StudentEntity | null> {
      const result = await db
        .prepare(
          `
          SELECT
            m_users.f_users_id,
            m_users.f_class_room_id,
            m_users.f_display_name,
            m_users.f_uid,
            m_student_description.f_student_id,
            m_student_description.f_attendance_number,
            m_student_description.f_student_id_number
          FROM m_student_description
          INNER JOIN m_users
            ON m_student_description.f_users_id = m_users.f_users_id
          WHERE m_student_description.f_student_id = ?`
        )
        .bind(id)
        .first();

      if (!result) {
        return null;
      }

      // Transform raw database result to typed entity
      return {
        f_users_id: result.f_users_id as number,
        f_class_room_id: result.f_class_room_id as number,
        f_display_name: result.f_display_name as string,
        f_uid: result.f_uid as string,
        f_student_id: result.f_student_id as number,
        f_attendance_number: result.f_attendance_number as string,
        f_student_id_number: result.f_student_id_number as string,
      };
    },

    async findAll(): Promise<StudentEntity[]> {
      const result = await db
        .prepare(
          `
          SELECT
            m_users.f_users_id,
            m_users.f_class_room_id,
            m_users.f_display_name,
            m_users.f_uid,
            m_student_description.f_student_id,
            m_student_description.f_attendance_number,
            m_student_description.f_student_id_number
          FROM m_student_description
          INNER JOIN m_users
            ON m_student_description.f_users_id = m_users.f_users_id
        `
        )
        .all();

      return result.results.map(row => ({
        f_users_id: row.f_users_id as number,
        f_class_room_id: row.f_class_room_id as number,
        f_display_name: row.f_display_name as string,
        f_uid: row.f_uid as string,
        f_student_id: row.f_student_id as number,
        f_attendance_number: row.f_attendance_number as string,
        f_student_id_number: row.f_student_id_number as string,
      }));
    },

    async findByStudentNum(studentNum: string): Promise<StudentEntity | null> {
      const result = await db
        .prepare(
          `
          SELECT
            m_users.f_users_id,
            m_users.f_class_room_id,
            m_users.f_display_name,
            m_users.f_uid,
            m_student_description.f_student_id,
            m_student_description.f_attendance_number,
            m_student_description.f_student_id_number
          FROM m_student_description
          INNER JOIN m_users
            ON m_student_description.f_users_id = m_users.f_users_id
          WHERE m_student_description.f_student_id_number = ?`
        )
        .bind(studentNum)
        .first();

      if (!result) {
        return null;
      }

      return {
        f_users_id: result.f_users_id as number,
        f_class_room_id: result.f_class_room_id as number,
        f_display_name: result.f_display_name as string,
        f_uid: result.f_uid as string,
        f_student_id: result.f_student_id as number,
        f_attendance_number: result.f_attendance_number as string,
        f_student_id_number: result.f_student_id_number as string,
      };
    },
  };
}
