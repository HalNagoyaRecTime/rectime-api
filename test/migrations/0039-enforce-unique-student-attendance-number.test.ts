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

describe('0039_enforce_unique_student_attendance_number.sql', () => {
  it('同じクラスの出席番号重複を拒否し、別クラスと未所属は許可する', async () => {
    const firstClassRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('0039-A', '0039 Aクラス')
       RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const secondClassRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('0039-B', '0039 Bクラス')
       RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const userIds = await Promise.all([
      insertUser('0039 Student 1'),
      insertUser('0039 Student 2'),
      insertUser('0039 Student 3'),
      insertUser('0039 Student 4'),
    ]);

    try {
      await env.DB.prepare(
        `INSERT INTO students (
          user_id, class_room_id, attendance_number, student_id_number
        ) VALUES (?, ?, 1, '0039-1')`
      )
        .bind(userIds[0], firstClassRoom!.class_room_id)
        .run();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0039-2')`
        )
          .bind(userIds[1], firstClassRoom!.class_room_id)
          .run()
      ).rejects.toThrow(/UNIQUE constraint failed/);

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0039-3')`
        )
          .bind(userIds[2], secondClassRoom!.class_room_id)
          .run()
      ).resolves.toBeDefined();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, NULL, NULL, '0039-4')`
        )
          .bind(userIds[3])
          .run()
      ).resolves.toBeDefined();
    } finally {
      await env.DB.prepare(
        `DELETE FROM students
         WHERE student_id_number LIKE '0039-%'`
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?, ?, ?)')
        .bind(...userIds)
        .run();
      await env.DB.prepare(
        `DELETE FROM class_rooms WHERE class_code IN ('0039-A', '0039-B')`
      ).run();
    }
  });
});
