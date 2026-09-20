import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { class_rooms, staffs, students, users } from '../database/schema';

import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type {
  StudentEntity,
  StudentPage,
  StudentWriteInput,
} from '../../domain/entities/Student';
import { buildProvisionalTeamName } from '../../domain/entities/Team';
import {
  BulkCreateStudentsInput,
  IStudentRepository,
} from '../../domain/interfaces/repositories/IStudentRepository';
import { chunkArray } from './chunk';
import { escapeLikePattern } from '../helpers/escapeLikePattern';

const D1_MAX_BOUND_PARAMETERS = 100;
const USER_ID_ALLOCATION_MAX_ATTEMPTS = 3;

type StudentJoinRow = {
  students: typeof students.$inferSelect;
  users: typeof users.$inferSelect;
  class_rooms: typeof class_rooms.$inferSelect;
  staffs: typeof staffs.$inferSelect | null;
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
  team_id: number;
  attendance_number: number;
  student_id_number: string;
};

function toDomain(row: StudentJoinRow): StudentEntity {
  return {
    studentId: row.students.id,
    userId: row.users.id,
    userName: row.users.userName,
    classRoomId: row.students.classRoomId,
    classRoomCode: row.class_rooms.classCode,
    classRoomName: row.class_rooms.name,
    teamId: row.class_rooms.teamId,
    attendanceNumber: row.students.attendanceNumber,
    studentIdNumber: row.students.studentIdNumber,
    isLiveActive: row.users.isLiveActive === 1,
    isStaff: Boolean(row.staffs),
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
        .leftJoin(staffs, eq(users.id, staffs.userId))
        .where(eq(students.id, id))
        .get();

      return result ? toDomain(result) : null;
    },

    async findByUserId(userId: number): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId))
        .where(eq(students.userId, userId))
        .get();

      return result ? toDomain(result) : null;
    },

    async findAll(filter = {}): Promise<StudentPage> {
      const limit = filter.limit ?? 50;
      const offset = filter.offset ?? 0;
      const conditions = [];
      if (filter.search) {
        const escapedPattern = `%${escapeLikePattern(filter.search)}%`;
        conditions.push(
          or(
            sql`${users.userName} LIKE ${escapedPattern} ESCAPE ${'\\'}`,
            sql`${students.studentIdNumber} LIKE ${escapedPattern} ESCAPE ${'\\'}`,
            sql`CAST(${students.attendanceNumber} AS TEXT) LIKE ${escapedPattern} ESCAPE ${'\\'}`,
            sql`${class_rooms.classCode} LIKE ${escapedPattern} ESCAPE ${'\\'}`,
            sql`${class_rooms.name} LIKE ${escapedPattern} ESCAPE ${'\\'}`
          )!
        );
      }
      if (filter.classRoomId !== undefined) {
        conditions.push(eq(students.classRoomId, filter.classRoomId));
      }
      if (filter.isLiveActive !== undefined) {
        conditions.push(eq(users.isLiveActive, filter.isLiveActive ? 1 : 0));
      }
      if (filter.isStaff !== undefined) {
        conditions.push(
          filter.isStaff ? isNotNull(staffs.id) : isNull(staffs.id)
        );
      }
      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;
      const countQuery = orm
        .select({ count: sql<number>`count(*)` })
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId));
      const rowsQuery = orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId));
      const sortOrder = filter.sortOrder === 'desc' ? desc : asc;
      const sortColumn =
        filter.sortBy === 'studentIdNumber'
          ? students.studentIdNumber
          : filter.sortBy === 'displayName'
            ? users.userName
            : filter.sortBy === 'classCode'
              ? class_rooms.classCode
              : filter.sortBy === 'className'
                ? class_rooms.name
                : filter.sortBy === 'attendanceNumber'
                  ? students.attendanceNumber
                  : filter.sortBy === 'isStaff'
                    ? sql<number>`CASE WHEN ${staffs.id} IS NULL THEN 0 ELSE 1 END`
                    : filter.sortBy === 'isLiveActive'
                      ? users.isLiveActive
                      : students.id;
      const [countResult, results] = await Promise.all([
        (whereClause ? countQuery.where(whereClause) : countQuery).get(),
        (whereClause ? rowsQuery.where(whereClause) : rowsQuery)
          .orderBy(sortOrder(sortColumn), asc(students.id))
          .limit(limit)
          .offset(offset)
          .all(),
      ]);
      const total = countResult?.count ?? 0;

      return {
        items: results.map(toDomain),
        total,
        limit,
        offset,
      };
    },

    async findByStudentNum(studentNum: string): Promise<StudentEntity | null> {
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId))
        .where(eq(students.studentIdNumber, studentNum))
        .get();

      return result ? toDomain(result) : null;
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

    async create(student: StudentWriteInput): Promise<StudentEntity> {
      const [userResult, studentResult] = await db.batch<
        ReturnedUserRow | ReturnedStudentRow
      >([
        db
          .prepare(
            `INSERT INTO users (user_name, updated_at)
             VALUES (?, CURRENT_TIMESTAMP)
             RETURNING user_id, user_name, is_live_active`
          )
          .bind(student.displayName),
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
              ) AS class_room_name,
              (
                SELECT team_id
                FROM class_rooms
                WHERE class_room_id = ?
              ) AS team_id`
          )
          .bind(
            student.classRoomId,
            student.attendanceNumber,
            student.studentIdNumber,
            student.classRoomId,
            student.classRoomId
          ),
      ]);

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const created = studentResult.results[0] as
        | ReturnedStudentRow
        | undefined;
      if (!user || !created) {
        throw new Error('Failed to create student');
      }
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId))
        .where(eq(students.id, created.student_id))
        .get();
      if (!result) throw new Error('Failed to create student');
      return toDomain(result);
    },

    async update(
      id: number,
      student: StudentWriteInput
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
          .bind(student.displayName, id),
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
               ) AS class_room_name,
               (
                 SELECT team_id
                 FROM class_rooms
                 WHERE class_room_id = ?
               ) AS team_id`
          )
          .bind(
            student.classRoomId,
            student.attendanceNumber,
            student.studentIdNumber,
            id,
            student.classRoomId,
            student.classRoomId
          ),
      ]);

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const updated = studentResult.results[0] as
        | ReturnedStudentRow
        | undefined;
      if (!user || !updated) return null;
      const result = await orm
        .select()
        .from(students)
        .innerJoin(users, eq(students.userId, users.id))
        .innerJoin(class_rooms, eq(students.classRoomId, class_rooms.id))
        .leftJoin(staffs, eq(users.id, staffs.userId))
        .where(eq(students.id, id))
        .get();
      return result ? toDomain(result) : null;
    },

    async createMany(input: BulkCreateStudentsInput): Promise<void> {
      if (input.students.length === 0) {
        return;
      }

      const classRoomStatements: D1PreparedStatement[] = [];
      for (const chunk of chunkArray(
        input.newClassRooms,
        Math.floor(D1_MAX_BOUND_PARAMETERS / 5)
      )) {
        const teamPlaceholders = chunk.map(() => '(?)').join(', ');
        classRoomStatements.push(
          db
            .prepare(`INSERT INTO teams (team_name) VALUES ${teamPlaceholders}`)
            .bind(...chunk.map(buildProvisionalTeamName))
        );
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
                buildProvisionalTeamName(room)
              )
          );
        }
      }

      await insertClassRoomsAndStudentsWithAllocatedUserIds(
        db,
        classRoomStatements,
        input.students
      );
    },

    async anonymizeByUserId(userId: number): Promise<boolean> {
      // users.user_nameの匿名化はUserRepository.anonymizeUserがロールの
      // 種類によらず担当する(AccountDeletionService.deleteRelatedDataの
      // 先頭で呼び出し済み)。ここではstudents固有のカラム
      // (student_id_number)のみを扱う。
      //
      // class_room_id・attendance_numberは学生本人の個人情報ではないため
      // 変更しない。student_id_numberはUNIQUE制約付きだが、userIdを含む
      // ことで他の匿名化済み行と衝突しない値にする。
      const result = await orm
        .update(students)
        .set({
          studentIdNumber: `deleted-${userId}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(students.userId, userId))
        .run();
      return result.meta.changes > 0;
    },
  };
}

/**
 * 新規クラス・チームと、事前採番したuser_idを使うusers・studentsを、
 * すべて1回のdb.batch()にまとめてINSERTする。
 *
 * 新規クラス・チームの作成と生徒の作成を別々のdb.batch()に分けると、
 * 前半が確定した後に後半が失敗した場合に手動での後片付けが必要になる
 * （編成名・クラスコードのUNIQUE制約により、残った分が以後の取り込みを
 * 名前衝突で弾き続ける）。1回のbatch呼び出しはD1上でアトミックなので、
 * 1つにまとめることでこの後片付け自体を不要にする。
 *
 * また、last_insert_rowid()に頼らず先にuser_idを決めておくことで生徒側も
 * 1人ずつ文を分ける必要がなくなり、受付上限2,500件・新規クラス100件でも
 * 合計250文程度に収まる（D1の1 Worker呼び出しあたりのサブリクエスト
 * 上限1,000に対して十分小さい）。
 *
 * MAX(user_id)取得後、実際にINSERTするまでの間に別経路（ロック対象外の
 * マスターインポートや通常ログインでの新規ユーザー作成）でuser_idが
 * 使われてしまうと衝突しうるため、その場合のみ採番からやり直す。
 *
 * 起点は現存する行のMAXだけでなく、AUTOINCREMENTの高水位(sqlite_sequence)
 * との大きい方を採る。外部アカウントとの紐付け失敗時の後始末でusersの
 * 最後の行が削除されるケースがあり、その直後は現存行のMAXだけでは
 * 既に払い出し済みの識別子まで下がってしまう。このプロジェクトは
 * 識別子の再利用を意図的に避けてきており（firebase_token_idの移行と同じ
 * 考え方）、ここも同様に扱う。
 */
async function insertClassRoomsAndStudentsWithAllocatedUserIds(
  db: D1Database,
  classRoomStatements: D1PreparedStatement[],
  students: BulkCreateStudentsInput['students']
): Promise<void> {
  for (let attempt = 1; attempt <= USER_ID_ALLOCATION_MAX_ATTEMPTS; attempt++) {
    const seed = await db
      .prepare(
        `SELECT COALESCE(
           MAX(
             (SELECT COALESCE(MAX(user_id), 0) FROM users),
             (SELECT COALESCE(seq, 0) FROM sqlite_sequence WHERE name = 'users')
           ),
           0
         ) AS max_user_id`
      )
      .first<{ max_user_id: number }>();
    const rows = students.map((student, index) => ({
      ...student,
      userId: (seed?.max_user_id ?? 0) + index + 1,
    }));

    const statements: D1PreparedStatement[] = [...classRoomStatements];
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
