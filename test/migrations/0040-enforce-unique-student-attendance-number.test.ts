import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0040_enforce_unique_student_attendance_number.sql'
  );
  if (!migration) {
    throw new Error(
      '0040_enforce_unique_student_attendance_number.sql is not registered'
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

describe('0040_enforce_unique_student_attendance_number.sql', () => {
  it('同じクラスの出席番号重複を拒否し、別クラスと未所属は許可する', async () => {
    const firstClassRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('0040-A', '0040 Aクラス')
       RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const secondClassRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('0040-B', '0040 Bクラス')
       RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const userIds = await Promise.all([
      insertUser('0040 Student 1'),
      insertUser('0040 Student 2'),
      insertUser('0040 Student 3'),
      insertUser('0040 Student 4'),
    ]);

    try {
      await env.DB.prepare(
        `INSERT INTO students (
          user_id, class_room_id, attendance_number, student_id_number
        ) VALUES (?, ?, 1, '0040-1')`
      )
        .bind(userIds[0], firstClassRoom!.class_room_id)
        .run();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0040-2')`
        )
          .bind(userIds[1], firstClassRoom!.class_room_id)
          .run()
      ).rejects.toThrow(/UNIQUE constraint failed/);

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0040-3')`
        )
          .bind(userIds[2], secondClassRoom!.class_room_id)
          .run()
      ).resolves.toBeDefined();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, NULL, NULL, '0040-4')`
        )
          .bind(userIds[3])
          .run()
      ).resolves.toBeDefined();
    } finally {
      await env.DB.prepare(
        `DELETE FROM students
         WHERE student_id_number LIKE '0040-%'`
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?, ?, ?)')
        .bind(...userIds)
        .run();
      await env.DB.prepare(
        `DELETE FROM class_rooms WHERE class_code IN ('0040-A', '0040-B')`
      ).run();
    }
  });

  it('既存の重複を残したまま一意制約の追加を中断する', async () => {
    const classRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('0040-DUPLICATE', '0040 重複確認クラス')
       RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const userIds = await Promise.all([
      insertUser('0040 Duplicate Student 1'),
      insertUser('0040 Duplicate Student 2'),
    ]);

    await env.DB.prepare(
      'DROP INDEX IF EXISTS ux_students_class_room_attendance'
    ).run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 40, '0040-DUPLICATE-1')`
      ).bind(userIds[0], classRoom!.class_room_id),
      env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 40, '0040-DUPLICATE-2')`
      ).bind(userIds[1], classRoom!.class_room_id),
    ]);

    try {
      await expect(runMigration()).rejects.toThrow(
        /duplicate_group_count = 0/
      );

      const duplicatedStudents = await env.DB.prepare(
        `SELECT student_id_number
         FROM students
         WHERE class_room_id = ? AND attendance_number = 40
         ORDER BY student_id_number`
      )
        .bind(classRoom!.class_room_id)
        .all<{ student_id_number: string }>();
      expect(duplicatedStudents.results).toEqual([
        { student_id_number: '0040-DUPLICATE-1' },
        { student_id_number: '0040-DUPLICATE-2' },
      ]);

      const uniqueIndex = await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND name = 'ux_students_class_room_attendance'`
      ).first();
      expect(uniqueIndex).toBeNull();
    } finally {
      await env.DB.prepare(
        "DELETE FROM students WHERE student_id_number LIKE '0040-DUPLICATE-%'"
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?)')
        .bind(...userIds)
        .run();
      await env.DB.prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
        .bind(classRoom!.class_room_id)
        .run();
      await env.DB.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_students_class_room_attendance
         ON students (class_room_id, attendance_number)
         WHERE class_room_id IS NOT NULL`
      ).run();
      await env.DB.prepare(
        'DROP TABLE IF EXISTS __migration_0040_duplicate_guard'
      ).run();
    }
  });
});
