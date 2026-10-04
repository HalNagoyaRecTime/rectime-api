import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

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
});
