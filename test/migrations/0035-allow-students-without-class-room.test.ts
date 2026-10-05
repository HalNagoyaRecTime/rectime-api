import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0035_allow_students_without_class_room.sql'
  );
  if (!migration) {
    throw new Error(
      '0035_allow_students_without_class_room.sql is not registered'
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

describe('0035_allow_students_without_class_room.sql', () => {
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
    const userId = await insertUser('0035未所属Student');

    await expect(
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, NULL, NULL, ?)`
      )
        .bind(userId, '0035-UNASSIGNED')
        .run()
    ).resolves.toBeDefined();
  });

  it.each([
    ['class_room_idだけNULL', null, 1],
    ['attendance_numberだけNULL', 1, null],
  ])('%sのStudentは登録できない', async (_, classRoomId, attendanceNumber) => {
    const userId = await insertUser(`0035不整合-${String(classRoomId)}`);

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
          `0035-INCONSISTENT-${String(classRoomId)}`
        )
        .run()
    ).rejects.toThrow(/CHECK/);
  });

  it('既存の所属Studentとindexを維持する', async () => {
    const existingStudent = await env.DB.prepare(
      `SELECT student_id, class_room_id, attendance_number
       FROM students
       WHERE class_room_id IS NOT NULL
       LIMIT 1`
    ).first<{
      student_id: number;
      class_room_id: number;
      attendance_number: number;
    }>();
    expect(existingStudent).not.toBeNull();

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
    const classRoom = await env.DB.prepare(
      'SELECT class_room_id FROM class_rooms ORDER BY class_room_id LIMIT 1'
    ).first<{ class_room_id: number }>();
    expect(classRoom).not.toBeNull();

    const maxStudent = await env.DB.prepare(
      'SELECT COALESCE(MAX(student_id), 0) AS max_id FROM students'
    ).first<{ max_id: number }>();
    const deletedStudentId = (maxStudent?.max_id ?? 0) + 1000;
    const deletedUserId = await insertUser('0035削除済みStudent');

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
        classRoom!.class_room_id,
        '0035-DELETED-SEQUENCE'
      )
      .run();
    await env.DB.prepare('DELETE FROM students WHERE student_id = ?')
      .bind(deletedStudentId)
      .run();

    const nextUserId = await insertUser('0035次回Student');

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
        .bind(
          nextUserId,
          classRoom!.class_room_id,
          '0035-NEXT-SEQUENCE'
        )
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
