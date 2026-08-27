import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
} from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { chunkArray } from './chunk';

const D1_MAX_BOUND_PARAMETERS = 100;

type ClassRoomRow = {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher_id: number | null;
  teacher_user_id: number | null;
  teacher_display_name: string | null;
};

const classRoomSelect = `
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

function toEntity(row: ClassRoomRow): ClassRoomEntity {
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

export function createClassRoomRepository(
  db: D1Database
): IClassRoomRepository {
  const findById = async (id: number): Promise<ClassRoomEntity | null> => {
    const row = await db
      .prepare(
        `${classRoomSelect} WHERE c.class_room_id = ? GROUP BY c.class_room_id`
      )
      .bind(id)
      .first<ClassRoomRow>();
    return row ? toEntity(row) : null;
  };

  return {
    async findAll(limit: number, offset: number): Promise<ClassRoomPage> {
      const [rows, count] = await Promise.all([
        db
          .prepare(
            `${classRoomSelect} GROUP BY c.class_room_id ORDER BY c.class_room_id LIMIT ? OFFSET ?`
          )
          .bind(limit, offset)
          .all<ClassRoomRow>(),
        db
          .prepare('SELECT COUNT(*) AS total FROM class_rooms')
          .first<{ total: number }>(),
      ]);
      return {
        classrooms: rows.results.map(toEntity),
        total: Number(count?.total ?? 0),
        limit,
        offset,
      };
    },

    findById,

    async findByCode(classCode: string): Promise<ClassRoomEntity | null> {
      const row = await db
        .prepare(
          `${classRoomSelect} WHERE c.class_code = ? GROUP BY c.class_room_id`
        )
        .bind(classCode)
        .first<ClassRoomRow>();
      return row ? toEntity(row) : null;
    },

    async findExistingClassCodes(classCodes: string[]): Promise<Set<string>> {
      const unique = Array.from(new Set(classCodes));
      const found = new Set<string>();

      for (const chunk of chunkArray(unique, D1_MAX_BOUND_PARAMETERS)) {
        const placeholders = chunk.map(() => '?').join(', ');
        const result = await db
          .prepare(
            `SELECT class_code FROM class_rooms WHERE class_code IN (${placeholders})`
          )
          .bind(...chunk)
          .all<{ class_code: string }>();
        for (const row of result.results) {
          found.add(row.class_code);
        }
      }

      return found;
    },

    async create(input: ClassRoomInput): Promise<ClassRoomEntity> {
      const team = await db
        .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
        .bind(input.class_name)
        .first<{ team_id: number }>();
      if (!team) throw new Error('Failed to create team for class room');
      const row = await db
        .prepare(
          'INSERT INTO class_rooms (class_code, class_name, teacher_id, team_id) VALUES (?, ?, ?, ?) RETURNING class_room_id'
        )
        .bind(
          input.class_code,
          input.class_name,
          input.teacher_id,
          team.team_id
        )
        .first<{ class_room_id: number }>();
      if (!row) throw new Error('Failed to create class');
      const classroom = await findById(row.class_room_id);
      if (!classroom) throw new Error('Failed to fetch created class');
      return classroom;
    },

    async createMany(inputs: ClassRoomInput[]): Promise<void> {
      if (inputs.length === 0) {
        return;
      }

      const statements: D1PreparedStatement[] = [];
      for (const input of inputs) {
        statements.push(
          db
            .prepare('INSERT INTO teams (team_name) VALUES (?)')
            .bind(input.class_name)
        );
        statements.push(
          db
            .prepare(
              `INSERT INTO class_rooms (class_code, class_name, teacher_id, team_id)
               VALUES (?, ?, ?, last_insert_rowid())`
            )
            .bind(input.class_code, input.class_name, input.teacher_id)
        );
      }
      await db.batch(statements);
    },

    async update(
      id: number,
      input: ClassRoomInput
    ): Promise<ClassRoomEntity | null> {
      const row = await db
        .prepare(
          'UPDATE class_rooms SET class_code = ?, class_name = ?, teacher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE class_room_id = ? RETURNING class_room_id'
        )
        .bind(input.class_code, input.class_name, input.teacher_id, id)
        .first<{ class_room_id: number }>();
      return row ? findById(row.class_room_id) : null;
    },

    async delete(id: number): Promise<boolean> {
      const row = await db
        .prepare(
          'DELETE FROM class_rooms WHERE class_room_id = ? RETURNING team_id'
        )
        .bind(id)
        .first<{ team_id: number }>();
      if (!row) return false;
      await db
        .prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(row.team_id)
        .run();
      return true;
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
