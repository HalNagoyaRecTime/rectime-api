import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { class_rooms, students, users } from '../database/schema';

import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { StudentEntity } from '../../domain/entities/Student';
import {
  BulkCreateStudentsInput,
  IStudentRepository,
} from '../../domain/interfaces/repositories/IStudentRepository';
import { StudentWriteDTO } from '../../application/dto/StudentDTO';
import { chunkArray } from './chunk';

const D1_MAX_BOUND_PARAMETERS = 100;
const USER_ID_ALLOCATION_MAX_ATTEMPTS = 3;

function provisionalTeamName(room: {
  classCode: string;
  className: string;
}): string {
  return `${room.className}(${room.classCode})`;
}

type StudentJoinRow = {
  students: typeof students.$inferSelect;
  users: typeof users.$inferSelect;
  class_rooms: typeof class_rooms.$inferSelect;
};

type ReturnedUserRow = {
  user_id: number;
  user_name: string;
  is_live_active: number;
};

type ReturnedStudentRow = {
  student_id: number;
  user_id: number;
  class_room_id: number;
  class_room_name: string;
  attendance_number: number;
  student_id_number: string;
};

function toEntity(row: StudentJoinRow): StudentEntity {
  return {
    student_id: row.students.id,
    user_id: row.users.id,
    user_name: row.users.userName,
    class_room_id: row.students.classRoomId,
    class_room_name: row.class_rooms.name,
    attendance_number: row.students.attendanceNumber,
    student_id_number: row.students.studentIdNumber,
    is_live_active: row.users.isLiveActive === 1,
  };
}

function toWrittenEntity(
  user: ReturnedUserRow,
  student: ReturnedStudentRow
): StudentEntity {
  return {
    student_id: student.student_id,
    user_id: user.user_id,
    user_name: user.user_name,
    class_room_id: student.class_room_id,
    class_room_name: student.class_room_name,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
    is_live_active: user.is_live_active === 1,
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
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .where(eq(students.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findByUserId(userId: number): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .where(eq(students.userId, userId))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll({
      limit,
      offset,
    }: {
      limit: number;
      offset: number;
    }): Promise<{ students: StudentEntity[]; total: number }> {
      const [results, totalResult] = await Promise.all([
        orm
          .select()
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
          .orderBy(asc(students.id))
          .limit(limit)
          .offset(offset)
          .all(),
        orm.select({ total: count() }).from(students).get(),
      ]);

      return {
        students: results.map(toEntity),
        total: totalResult?.total ?? 0,
      };
    },

    async findByStudentNum(studentNum: string): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .where(eq(students.studentIdNumber, studentNum))
        .get();

      return result ? toEntity(result) : null;
    },

    async findExistingStudentNumbers(
      studentNumbers: string[]
    ): Promise<Set<string>> {
      const unique = Array.from(new Set(studentNumbers));
      const found = new Set<string>();

      for (const chunk of chunkArray(unique, D1_MAX_BOUND_PARAMETERS)) {
        const rows = await orm
          .select({ studentIdNumber: students.studentIdNumber })
          .from(students)
          .where(inArray(students.studentIdNumber, chunk))
          .all();
        for (const row of rows) {
          found.add(row.studentIdNumber);
        }
      }

      return found;
    },

    async classRoomExists(classRoomId: number): Promise<boolean> {
      const classRoom = await orm
        .select({ id: class_rooms.id })
        .from(class_rooms)
        .where(eq(class_rooms.id, classRoomId))
        .get();
      return Boolean(classRoom);
    },

    async create(student: StudentWriteDTO): Promise<StudentEntity> {
      const [userResult, studentResult] = await db.batch<
        ReturnedUserRow | ReturnedStudentRow
      >([
        db
          .prepare(
            `INSERT INTO users (user_name, updated_at)
             VALUES (?, CURRENT_TIMESTAMP)
             RETURNING user_id, user_name, is_live_active`
          )
          .bind(student.display_name),
        db
          .prepare(
            `INSERT INTO students (
              user_id,
              class_room_id,
              attendance_number,
              student_id_number,
              updated_at
            ) VALUES (last_insert_rowid(), ?, ?, ?, CURRENT_TIMESTAMP)
            RETURNING
              student_id,
              user_id,
              class_room_id,
              attendance_number,
              student_id_number,
              (
                SELECT class_name
                FROM class_rooms
                WHERE class_room_id = ?
              ) AS class_room_name`
          )
          .bind(
            student.class_room_id,
            student.attendance_number,
            student.student_id_number,
            student.class_room_id
          ),
      ]);

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const created = studentResult.results[0] as
        | ReturnedStudentRow
        | undefined;
      if (!user || !created) {
        throw new Error('Failed to create student');
      }
      return toWrittenEntity(user, created);
    },

    async update(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentEntity | null> {
      const [userResult, studentResult] = await db.batch<
        ReturnedUserRow | ReturnedStudentRow
      >([
        db
          .prepare(
            `UPDATE users
             SET user_name = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = (
               SELECT user_id FROM students WHERE student_id = ?
             )
             RETURNING user_id, user_name, is_live_active`
          )
          .bind(student.display_name, id),
        db
          .prepare(
            `UPDATE students
             SET class_room_id = ?, attendance_number = ?, student_id_number = ?, updated_at = CURRENT_TIMESTAMP
             WHERE student_id = ?
             RETURNING
               student_id,
               user_id,
               class_room_id,
               attendance_number,
               student_id_number,
               (
                 SELECT class_name
                 FROM class_rooms
                 WHERE class_room_id = ?
               ) AS class_room_name`
          )
          .bind(
            student.class_room_id,
            student.attendance_number,
            student.student_id_number,
            id,
            student.class_room_id
          ),
      ]);

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const updated = studentResult.results[0] as
        | ReturnedStudentRow
        | undefined;
      return user && updated ? toWrittenEntity(user, updated) : null;
    },

    async createMany(input: BulkCreateStudentsInput): Promise<void> {
      if (input.students.length === 0) {
        return;
      }

      const committedNewClassRooms: BulkCreateStudentsInput['newClassRooms'] =
        [];
      if (input.newClassRooms.length > 0) {
        try {
          for (const chunk of chunkArray(
            input.newClassRooms,
            Math.floor(D1_MAX_BOUND_PARAMETERS / 5)
          )) {
            const teamPlaceholders = chunk.map(() => '(?)').join(', ');
            const classRoomStatements: D1PreparedStatement[] = [
              db
                .prepare(
                  `INSERT INTO teams (team_name) VALUES ${teamPlaceholders}`
                )
                .bind(...chunk.map(provisionalTeamName)),
            ];
            for (const room of chunk) {
              classRoomStatements.push(
                db
                  .prepare(
                    `INSERT INTO class_rooms (class_code, class_name, teacher_id, team_id, updated_at)
                     SELECT ?, ?, NULL, team_id, CURRENT_TIMESTAMP FROM teams WHERE team_name = ?`
                  )
                  .bind(
                    room.classCode,
                    room.className,
                    provisionalTeamName(room)
                  )
              );
            }
            await db.batch(classRoomStatements);
            committedNewClassRooms.push(...chunk);
          }
        } catch (error) {
          if (committedNewClassRooms.length > 0) {
            try {
              await deleteNewClassRoomsAndTeams(db, committedNewClassRooms);
            } catch (cleanupError) {
              console.error(
                'Error deleting already-committed class rooms/teams after class room creation failure:',
                cleanupError
              );
              throw new Error(
                `新規クラス・チームの登録に失敗し、さらに登録済み分の削除にも失敗しました。手動でのデータ確認が必要です。: ${String(cleanupError)}`,
                { cause: error }
              );
            }
          }
          throw error;
        }
      }

      try {
        await insertStudentsWithAllocatedUserIds(db, input.students);
      } catch (error) {
        if (committedNewClassRooms.length > 0) {
          try {
            await deleteNewClassRoomsAndTeams(db, committedNewClassRooms);
          } catch (cleanupError) {
            console.error(
              'Error deleting class rooms/teams after student creation failure:',
              cleanupError
            );
            throw new Error(
              `生徒の登録に失敗し、新規クラス・チームの後片付けにも失敗しました。手動でのデータ確認が必要です。: ${String(cleanupError)}`,
              { cause: error }
            );
          }
        }
        throw error;
      }
    },
  };
}

/**
 * users・studentsを事前採番したuser_idでまとめてINSERTする。
 *
 * last_insert_rowid()に頼らず先にuser_idを決めておくことで、1人ずつ文を
 * 分ける必要がなくなり、受付上限2,500件でも合計150文程度に収まる
 * （D1の1 Worker呼び出しあたりのサブリクエスト上限1,000に対して十分小さい）。
 * db.batch()は1回の呼び出し内でアトミックなので、途中で失敗しても部分的な
 * 書き込みは残らず、手動での後片付けは不要。
 *
 * MAX(user_id)取得後、実際にINSERTするまでの間に別経路（ロック対象外の
 * マスターインポートや通常ログインでの新規ユーザー作成）でuser_idが
 * 使われてしまうと衝突しうるため、その場合のみ採番からやり直す。
 */
async function insertStudentsWithAllocatedUserIds(
  db: D1Database,
  students: BulkCreateStudentsInput['students']
): Promise<void> {
  for (let attempt = 1; attempt <= USER_ID_ALLOCATION_MAX_ATTEMPTS; attempt++) {
    const seed = await db
      .prepare('SELECT COALESCE(MAX(user_id), 0) AS max_user_id FROM users')
      .first<{ max_user_id: number }>();
    const rows = students.map((student, index) => ({
      ...student,
      userId: (seed?.max_user_id ?? 0) + index + 1,
    }));

    const statements: D1PreparedStatement[] = [];
    for (const chunk of chunkArray(
      rows,
      Math.floor(D1_MAX_BOUND_PARAMETERS / 2)
    )) {
      const placeholders = chunk
        .map(() => '(?, ?, CURRENT_TIMESTAMP)')
        .join(', ');
      statements.push(
        db
          .prepare(
            `INSERT INTO users (user_id, user_name, updated_at) VALUES ${placeholders}`
          )
          .bind(...chunk.flatMap(row => [row.userId, row.displayName]))
      );
    }
    for (const chunk of chunkArray(
      rows,
      Math.floor(D1_MAX_BOUND_PARAMETERS / 4)
    )) {
      const placeholders = chunk
        .map(
          () =>
            '(?, (SELECT class_room_id FROM class_rooms WHERE class_code = ?), ?, ?, CURRENT_TIMESTAMP)'
        )
        .join(', ');
      statements.push(
        db
          .prepare(
            `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number, updated_at)
             VALUES ${placeholders}`
          )
          .bind(
            ...chunk.flatMap(row => [
              row.userId,
              row.classCode,
              row.attendanceNumber,
              row.studentIdNumber,
            ])
          )
      );
    }

    try {
      await db.batch(statements);
      return;
    } catch (error) {
      const isUserIdRace =
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed') &&
        error.message.includes('users.user_id');
      if (!isUserIdRace || attempt === USER_ID_ALLOCATION_MAX_ATTEMPTS) {
        throw error;
      }
      // 採番後、実行までの間に別経路でuser_idが使われた（同時ログイン等）。
      // user_idを取り直してリトライする。
    }
  }
}

async function deleteNewClassRoomsAndTeams(
  db: D1Database,
  newClassRooms: BulkCreateStudentsInput['newClassRooms']
) {
  const classCodes = newClassRooms.map(room => room.classCode);
  const teamNames = newClassRooms.map(provisionalTeamName);

  for (const chunk of chunkArray(classCodes, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM class_rooms WHERE class_code IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
  for (const chunk of chunkArray(teamNames, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM teams WHERE team_name IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}
