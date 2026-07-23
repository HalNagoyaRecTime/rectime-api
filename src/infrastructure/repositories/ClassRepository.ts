import type { D1Database } from '@cloudflare/workers-types';
import type {
  ClassEntity,
  ClassInput,
  ClassPage,
} from '../../domain/entities/Class';
import type { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';

type ClassRow = {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher_id: number | null;
  teacher_user_id: number | null;
  teacher_display_name: string | null;
};

const classSelect = `
  SELECT
    c.class_room_id,
    c.class_code,
    c.class_name,
    COUNT(s.student_id) AS student_count,
    t.teacher_id,
    u.user_id AS teacher_user_id,
    u.user_name AS teacher_display_name
  FROM class_rooms c
  LEFT JOIN students s ON s.class_room_id = c.class_room_id
  LEFT JOIN teachers t ON t.teacher_id = c.teacher_id
  LEFT JOIN users u ON u.user_id = t.user_id
`;

function toEntity(row: ClassRow): ClassEntity {
  return {
    class_room_id: row.class_room_id,
    class_code: row.class_code,
    class_name: row.class_name,
    student_count: Number(row.student_count),
    teacher:
      row.teacher_id === null ||
      row.teacher_user_id === null ||
      row.teacher_display_name === null
        ? null
        : {
            teacher_id: row.teacher_id,
            user_id: row.teacher_user_id,
            display_name: row.teacher_display_name,
          },
  };
}

export function createClassRepository(db: D1Database): IClassRepository {
  const findById = async (id: number): Promise<ClassEntity | null> => {
    const row = await db
      .prepare(
        `${classSelect} WHERE c.class_room_id = ? GROUP BY c.class_room_id`
      )
      .bind(id)
      .first<ClassRow>();
    return row ? toEntity(row) : null;
  };

  return {
    async findAll(page: number, limit: number): Promise<ClassPage> {
      const offset = (page - 1) * limit;
      const [rows, count] = await Promise.all([
        db
          .prepare(
            `${classSelect} GROUP BY c.class_room_id ORDER BY c.class_room_id LIMIT ? OFFSET ?`
          )
          .bind(limit, offset)
          .all<ClassRow>(),
        db
          .prepare('SELECT COUNT(*) AS total FROM class_rooms')
          .first<{ total: number }>(),
      ]);
      return {
        classrooms: rows.results.map(toEntity),
        total: Number(count?.total ?? 0),
        page,
        limit,
      };
    },

    findById,

    async create(input: ClassInput): Promise<ClassEntity> {
      const row = await db
        .prepare(
          'INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES (?, ?, ?) RETURNING class_room_id'
        )
        .bind(input.class_code, input.class_name, input.teacher_id)
        .first<{ class_room_id: number }>();
      if (!row) throw new Error('Failed to create class');
      const classroom = await findById(row.class_room_id);
      if (!classroom) throw new Error('Failed to fetch created class');
      return classroom;
    },

    async update(id: number, input: ClassInput): Promise<ClassEntity | null> {
      const row = await db
        .prepare(
          'UPDATE class_rooms SET class_code = ?, class_name = ?, teacher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE class_room_id = ? RETURNING class_room_id'
        )
        .bind(input.class_code, input.class_name, input.teacher_id, id)
        .first<{ class_room_id: number }>();
      return row ? findById(row.class_room_id) : null;
    },

    async delete(id: number): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
        .bind(id)
        .run();
      return (result.meta.changes ?? 0) > 0;
    },

    async teacherExists(id: number): Promise<boolean> {
      const row = await db
        .prepare('SELECT teacher_id FROM teachers WHERE teacher_id = ?')
        .bind(id)
        .first();
      return row !== null;
    },

    async hasStudents(id: number): Promise<boolean> {
      const row = await db
        .prepare(
          'SELECT 1 AS referenced FROM students WHERE class_room_id = ? LIMIT 1'
        )
        .bind(id)
        .first();
      return row !== null;
    },
  };
}
