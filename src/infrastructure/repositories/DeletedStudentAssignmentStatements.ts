import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { StudentClassRoomAttendanceNumber } from '../../domain/interfaces/repositories/IStudentRepository';
import { chunkArray } from './chunk';

// 退会中の学生(退会したusersを指すstudents行)のクラスと出席番号を外すSQLを
// 組み立てる。実行は呼び出し側のdb.batch()に任せ、登録・削除の本体と同じ
// トランザクションで確定させる。外す文は本体より前に置く(クラスと出席番号の
// 一意制約・class_roomsへの外部キーに、退会中の学生が引っかからないようにするため)。

const D1_MAX_BOUND_PARAMETERS = 100;

// 外した行も版番号を進める。students行が変わったことを、他の更新と同じく表す。
const RELEASE_ASSIGNMENT = `UPDATE students
   SET class_room_id = NULL, attendance_number = NULL,
       updated_at = CURRENT_TIMESTAMP, lock_version = lock_version + 1`;

// 「退会していないusersが無い」で判定する。deletion_status != 'active' の
// usersを集める書き方だと、インデックスで絞り込めずにusersを毎回全件読むため、
// 対象のstudents行ごとに主キーで1件引く形にする。
const IS_DELETED_STUDENT = `NOT EXISTS (
     SELECT 1 FROM users
     WHERE users.user_id = students.user_id
       AND users.deletion_status = 'active'
   )`;

/**
 * 登録・更新の前提条件。満たさないときは外す文も0件更新になり、
 * 本体が更新されない場合に退会中の学生の所属だけが外れることを防ぐ。
 */
export interface ReleaseCondition {
  // この学生が存在するときだけ外す
  studentId: number;
  // 指定したときは、その学生の版番号が一致するときだけ外す
  expectedLockVersion?: number;
}

/**
 * 指定したクラス・出席番号を使っている退会中の学生の所属を外す。
 * クラスか出席番号が未指定なら、ぶつかる枠が無いので文を作らない。
 */
export function buildReleaseDeletedStudentSlotStatements(
  db: D1Database,
  classRoomId: number | null,
  attendanceNumber: number | null,
  condition?: ReleaseCondition
): D1PreparedStatement[] {
  if (classRoomId === null || attendanceNumber === null) {
    return [];
  }
  if (!condition) {
    return [
      db
        .prepare(
          `${RELEASE_ASSIGNMENT}
           WHERE class_room_id = ? AND attendance_number = ?
             AND ${IS_DELETED_STUDENT}`
        )
        .bind(classRoomId, attendanceNumber),
    ];
  }
  return [
    db
      .prepare(
        `${RELEASE_ASSIGNMENT}
         WHERE class_room_id = ? AND attendance_number = ?
           AND ${IS_DELETED_STUDENT}
           AND EXISTS (
             SELECT 1 FROM students
             WHERE student_id = ? AND (? IS NULL OR lock_version = ?)
           )`
      )
      .bind(
        classRoomId,
        attendanceNumber,
        condition.studentId,
        // D1は番号付きプレースホルダを使えないため、版番号の条件は値を繰り返し渡す
        condition.expectedLockVersion ?? null,
        condition.expectedLockVersion ?? null
      ),
  ];
}

/**
 * CSV取込で使う枠(クラスコードと出席番号の組)を使っている、退会中の学生の
 * 所属を外す。
 */
export function buildReleaseDeletedStudentSlotsByClassCodeStatements(
  db: D1Database,
  assignments: StudentClassRoomAttendanceNumber[]
): D1PreparedStatement[] {
  return chunkArray(assignments, Math.floor(D1_MAX_BOUND_PARAMETERS / 2)).map(
    chunk => {
      const slots = chunk
        .map(
          () =>
            '(class_room_id = (SELECT class_room_id FROM class_rooms WHERE class_code = ?) AND attendance_number = ?)'
        )
        .join(' OR ');
      return db
        .prepare(
          `${RELEASE_ASSIGNMENT}
         WHERE (${slots})
           AND ${IS_DELETED_STUDENT}`
        )
        .bind(
          ...chunk.flatMap(assignment => [
            assignment.classCode,
            assignment.attendanceNumber,
          ])
        );
    }
  );
}

/**
 * 指定したクラスに所属している、退会中の学生全員の所属を外す。
 */
export function buildReleaseDeletedStudentsInClassRoomStatement(
  db: D1Database,
  classRoomId: number
): D1PreparedStatement {
  return db
    .prepare(
      `${RELEASE_ASSIGNMENT}
       WHERE class_room_id = ? AND ${IS_DELETED_STUDENT}`
    )
    .bind(classRoomId);
}
