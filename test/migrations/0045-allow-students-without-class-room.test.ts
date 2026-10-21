import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { insertClassRoomWithTeam } from '../fixtures/classRooms';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0045_allow_students_without_class_room.sql'
  );
  if (!migration) {
    throw new Error(
      '0045_allow_students_without_class_room.sql is not registered'
    );
  }
  return migration.queries;
})();

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function insertUser(userName: string): Promise<number> {
  const user = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  return user!.user_id;
}

async function insertAssignedStudent(): Promise<{
  student_id: number;
  class_room_id: number;
  attendance_number: number;
}> {
  const { classRoomId } = await insertClassRoomWithTeam(env.DB, {
    classCode: '0045-KEEP',
    className: '0045所属保持確認',
  });
  const userId = await insertUser('0045所属保持Student');
  const student = await env.DB.prepare(
    `INSERT INTO students (
      user_id,
      class_room_id,
      attendance_number,
      student_id_number
    ) VALUES (?, ?, 1, '0045-ASSIGNED')
    RETURNING student_id, class_room_id, attendance_number`
  )
    .bind(userId, classRoomId)
    .first<{
      student_id: number;
      class_room_id: number;
      attendance_number: number;
    }>();
  return student!;
}

describe('0045_allow_students_without_class_room.sql', () => {
  it('studentsの所属情報をNULL許容にする', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(students)').all<{
      name: string;
      notnull: number;
    }>();

    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'class_room_id', notnull: 0 }),
        expect.objectContaining({ name: 'attendance_number', notnull: 0 }),
      ])
    );
  });

  it('クラス未所属のStudentを登録できる', async () => {
    const userId = await insertUser('0045未所属Student');

    await expect(
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, NULL, NULL, ?)`
      )
        .bind(userId, '0045-UNASSIGNED')
        .run()
    ).resolves.toBeDefined();
  });

  it.each([
    ['class_room_idだけNULL', null, 1],
    ['attendance_numberだけNULL', 1, null],
  ])('%sのStudentは登録できない', async (_, classRoomId, attendanceNumber) => {
    const userId = await insertUser(`0045不整合-${String(classRoomId)}`);

    await expect(
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, ?, ?, ?)`
      )
        .bind(
          userId,
          classRoomId,
          attendanceNumber,
          `0045-INCONSISTENT-${String(classRoomId)}`
        )
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it('既存の所属Studentとindexを維持する', async () => {
    const expectedStudent = await insertAssignedStudent();

    await runMigration();

    const existingStudent = await env.DB.prepare(
      `SELECT student_id, class_room_id, attendance_number
       FROM students
       WHERE student_id = ?`
    )
      .bind(expectedStudent.student_id)
      .first<{
        student_id: number;
        class_room_id: number;
        attendance_number: number;
      }>();
    expect(existingStudent).toEqual(expectedStudent);

    const indexes = await env.DB.prepare('PRAGMA index_list(students)').all<{
      name: string;
    }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'idx_students_class_room_id_user_id',
        }),
      ])
    );
  });

  it('テーブル再作成後もAUTOINCREMENTの履歴を維持する', async () => {
    const { classRoomId } = await insertClassRoomWithTeam(env.DB, {
      classCode: '0045-SEQUENCE',
      className: '0045連番確認',
    });

    const maxStudent = await env.DB.prepare(
      'SELECT COALESCE(MAX(student_id), 0) AS max_id FROM students'
    ).first<{ max_id: number }>();
    const deletedStudentId = (maxStudent?.max_id ?? 0) + 1000;
    const deletedUserId = await insertUser('0045削除済みStudent');

    await env.DB.prepare(
      `INSERT INTO students (
        student_id,
        user_id,
        class_room_id,
        attendance_number,
        student_id_number
      ) VALUES (?, ?, ?, 1, ?)`
    )
      .bind(
        deletedStudentId,
        deletedUserId,
        classRoomId,
        '0045-DELETED-SEQUENCE'
      )
      .run();
    await env.DB.prepare('DELETE FROM students WHERE student_id = ?')
      .bind(deletedStudentId)
      .run();

    const nextUserId = await insertUser('0045次回Student');

    try {
      await runMigration();

      const inserted = await env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, ?, 2, ?)
        RETURNING student_id`
      )
        .bind(nextUserId, classRoomId, '0045-NEXT-SEQUENCE')
        .first<{ student_id: number }>();

      expect(inserted?.student_id).toBe(deletedStudentId + 1);
    } finally {
      await env.DB.prepare('DELETE FROM students WHERE user_id = ?')
        .bind(nextUserId)
        .run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?)')
        .bind(deletedUserId, nextUserId)
        .run();
    }
  });
});
