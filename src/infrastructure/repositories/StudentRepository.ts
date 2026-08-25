import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
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

type ReturnedBulkUserRow = {
  user_id: number;
  user_name: string;
};

type InactiveStudentRow = {
  studentId: number;
  userId: number;
  studentIdNumber: string;
};

type RestorableStudent = BulkCreateStudentsInput['students'][number] & {
  studentId: number;
  userId: number;
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
          .where(eq(users.isLiveActive, 1))
          .orderBy(asc(students.id))
          .limit(limit)
          .offset(offset)
          .all(),
        orm
          .select({ total: count() })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(eq(users.isLiveActive, 1))
          .get(),
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

      for (const chunk of chunkArray(unique, D1_MAX_BOUND_PARAMETERS - 1)) {
        const rows = await orm
          .select({ studentIdNumber: students.studentIdNumber })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(
            and(
              inArray(students.studentIdNumber, chunk),
              eq(users.isLiveActive, 1)
            )
          )
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

    async deactivate(id: number): Promise<boolean> {
      const existing = await orm
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, id))
        .get();
      if (!existing) return false;

      await orm
        .update(users)
        .set({ isLiveActive: 0, updatedAt: new Date().toISOString() })
        .where(eq(users.id, existing.userId));
      return true;
    },

    async update(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentEntity | null> {
      return writeStudent(db, id, student, false);
    },

    async restore(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentEntity | null> {
      return writeStudent(db, id, student, true);
    },

    async createMany(input: BulkCreateStudentsInput): Promise<void> {
      if (input.students.length === 0) {
        return;
      }

      const inactiveStudents: InactiveStudentRow[] = [];
      const uniqueStudentNumbers = Array.from(
        new Set(input.students.map(student => student.studentIdNumber))
      );
      for (const chunk of chunkArray(
        uniqueStudentNumbers,
        D1_MAX_BOUND_PARAMETERS - 1
      )) {
        const rows = await orm
          .select({
            studentId: students.id,
            userId: students.userId,
            studentIdNumber: students.studentIdNumber,
          })
          .from(students)
          .innerJoin(users, eq(students.userId, users.id))
          .where(
            and(
              inArray(students.studentIdNumber, chunk),
              eq(users.isLiveActive, 0)
            )
          )
          .all();
        inactiveStudents.push(...rows);
      }

      const inactiveByStudentNumber = new Map(
        inactiveStudents.map(student => [student.studentIdNumber, student])
      );
      const restorableStudents: RestorableStudent[] = [];
      const studentsToCreate: BulkCreateStudentsInput['students'] = [];
      for (const student of input.students) {
        const inactive = inactiveByStudentNumber.get(student.studentIdNumber);
        if (inactive) {
          restorableStudents.push({
            ...student,
            studentId: inactive.studentId,
            userId: inactive.userId,
          });
        } else {
          studentsToCreate.push(student);
        }
      }

      const statements: D1PreparedStatement[] = [];

      for (const chunk of chunkArray(
        input.newClassRooms,
        Math.floor(D1_MAX_BOUND_PARAMETERS / 2)
      )) {
        const placeholders = chunk
          .map(() => '(?, ?, NULL, CURRENT_TIMESTAMP)')
          .join(', ');
        const values = chunk.flatMap(room => [room.classCode, room.className]);
        statements.push(
          db
            .prepare(
              `INSERT INTO class_rooms (class_code, class_name, teacher_id, updated_at) VALUES ${placeholders}`
            )
            .bind(...values)
        );
      }

      const userStatementStartIndex = statements.length;
      for (const chunk of chunkArray(
        studentsToCreate,
        D1_MAX_BOUND_PARAMETERS
      )) {
        const placeholders = chunk
          .map(() => '(?, CURRENT_TIMESTAMP)')
          .join(', ');
        const values = chunk.map(student => student.displayName);
        statements.push(
          db
            .prepare(
              `INSERT INTO users (user_name, updated_at) VALUES ${placeholders} RETURNING user_id, user_name`
            )
            .bind(...values)
        );
      }

      const returnedUsers: ReturnedBulkUserRow[] = [];
      if (statements.length > 0) {
        const results = await db.batch<ReturnedBulkUserRow>(statements);
        for (let i = userStatementStartIndex; i < results.length; i++) {
          for (const row of results[i].results) {
            returnedUsers.push(row);
          }
        }
      }
      const userIds = returnedUsers.map(row => row.user_id);

      try {
        const studentsWithUserIds = pairStudentsWithCreatedUsers(
          studentsToCreate,
          returnedUsers
        );
        // 復元と新規学生の作成を同じbatchに含め、どちらかが失敗した場合は
        // 復元だけが反映された状態を残さない。
        const studentStatements = buildRestoreStudentStatements(
          db,
          restorableStudents
        );
        for (const chunk of chunkArray(
          studentsWithUserIds,
          Math.floor(D1_MAX_BOUND_PARAMETERS / 4)
        )) {
          const placeholders = chunk
            .map(
              () =>
                '(?, (SELECT class_room_id FROM class_rooms WHERE class_code = ?), ?, ?, CURRENT_TIMESTAMP)'
            )
            .join(', ');
          const values = chunk.flatMap(item => [
            item.userId,
            item.classCode,
            item.attendanceNumber,
            item.studentIdNumber,
          ]);
          studentStatements.push(
            db
              .prepare(
                `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number, updated_at) VALUES ${placeholders}`
              )
              .bind(...values)
          );
        }
        if (studentStatements.length > 0) {
          await db.batch(studentStatements);
        }
      } catch (error) {
        try {
          await deleteUsersByIds(db, userIds);
        } catch (userDeletionError) {
          console.error(
            'Error deleting users after student creation failure:',
            userDeletionError
          );
        }
        try {
          await deleteClassRoomsByCodes(
            db,
            input.newClassRooms.map(room => room.classCode)
          );
        } catch (classRoomDeletionError) {
          console.error(
            'Error deleting class rooms after student creation failure:',
            classRoomDeletionError
          );
        }
        throw error;
      }
    },
  };
}

async function writeStudent(
  db: D1Database,
  id: number,
  student: StudentWriteDTO,
  reactivate: boolean
): Promise<StudentEntity | null> {
  const [userResult, studentResult] = await db.batch<
    ReturnedUserRow | ReturnedStudentRow
  >([
    db
      .prepare(
        `UPDATE users
         SET user_name = ?,
             ${reactivate ? 'is_live_active = 1,' : ''}
             updated_at = CURRENT_TIMESTAMP
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
  const updated = studentResult.results[0] as ReturnedStudentRow | undefined;
  return user && updated ? toWrittenEntity(user, updated) : null;
}

function buildRestoreStudentStatements(
  db: D1Database,
  studentsToRestore: RestorableStudent[]
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];

  for (const chunk of chunkArray(
    studentsToRestore,
    Math.floor(D1_MAX_BOUND_PARAMETERS / 3)
  )) {
    const userNameCases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const userIds = chunk.map(student => student.userId);
    const userValues = chunk.flatMap(student => [
      student.userId,
      student.displayName,
    ]);
    statements.push(
      db
        .prepare(
          `UPDATE users
           SET user_name = CASE user_id ${userNameCases} ELSE user_name END,
               is_live_active = 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id IN (${userIds.map(() => '?').join(', ')})`
        )
        .bind(...userValues, ...userIds)
    );
  }

  for (const chunk of chunkArray(
    studentsToRestore,
    Math.floor(D1_MAX_BOUND_PARAMETERS / 5)
  )) {
    const classRoomCases = chunk
      .map(
        () =>
          'WHEN ? THEN (SELECT class_room_id FROM class_rooms WHERE class_code = ?)'
      )
      .join(' ');
    const attendanceNumberCases = chunk.map(() => 'WHEN ? THEN ?').join(' ');
    const studentIds = chunk.map(student => student.studentId);
    const classRoomValues = chunk.flatMap(student => [
      student.studentId,
      student.classCode,
    ]);
    const attendanceNumberValues = chunk.flatMap(student => [
      student.studentId,
      student.attendanceNumber,
    ]);
    statements.push(
      db
        .prepare(
          `UPDATE students
           SET class_room_id = CASE student_id ${classRoomCases} ELSE class_room_id END,
               attendance_number = CASE student_id ${attendanceNumberCases} ELSE attendance_number END,
               updated_at = CURRENT_TIMESTAMP
           WHERE student_id IN (${studentIds.map(() => '?').join(', ')})`
        )
        .bind(...classRoomValues, ...attendanceNumberValues, ...studentIds)
    );
  }

  return statements;
}

function pairStudentsWithCreatedUsers(
  studentInputs: BulkCreateStudentsInput['students'],
  returnedUsers: ReturnedBulkUserRow[]
) {
  if (returnedUsers.length !== studentInputs.length) {
    throw new Error(
      `Created user count does not match student input count: expected ${studentInputs.length}, received ${returnedUsers.length}`
    );
  }

  // SQLiteは複数行をRETURNINGした際の行順を保証しないため、
  // 配列の位置ではなく、登録した表示名ごとにIDをまとめて対応付ける。
  // 同姓同名のusers行はこの時点では区別できないため、IDをスタックとして消費する。
  // https://sqlite.org/lang_returning.html
  const userIdsByName = new Map<string, number[]>();
  for (const user of returnedUsers) {
    const ids = userIdsByName.get(user.user_name) ?? [];
    ids.push(user.user_id);
    userIdsByName.set(user.user_name, ids);
  }

  const paired = studentInputs.map((student, index) => {
    const userIds = userIdsByName.get(student.displayName);
    const userId = userIds?.pop();
    if (userId === undefined) {
      throw new Error(
        `Created user not found for student input at index ${index}`
      );
    }
    return {
      userId,
      classCode: student.classCode,
      attendanceNumber: student.attendanceNumber,
      studentIdNumber: student.studentIdNumber,
    };
  });

  return paired;
}

async function deleteUsersByIds(db: D1Database, userIds: number[]) {
  for (const chunk of chunkArray(userIds, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM users WHERE user_id IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}

async function deleteClassRoomsByCodes(db: D1Database, classCodes: string[]) {
  for (const chunk of chunkArray(classCodes, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM class_rooms WHERE class_code IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}
