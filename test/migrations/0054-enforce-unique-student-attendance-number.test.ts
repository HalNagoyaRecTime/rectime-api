import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { insertClassRoomWithTeam } from '../fixtures/classRooms';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0054_enforce_unique_student_attendance_number.sql'
  );
  if (!migration) {
    throw new Error(
      '0054_enforce_unique_student_attendance_number.sql is not registered'
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

describe('0054_enforce_unique_student_attendance_number.sql', () => {
  it('同じクラスの出席番号重複を拒否し、別クラスと未所属は許可する', async () => {
    const firstClassRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '0047-A',
      className: '0047 Aクラス',
    });
    const secondClassRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '0047-B',
      className: '0047 Bクラス',
    });
    const userIds = await Promise.all([
      insertUser('0047 Student 1'),
      insertUser('0047 Student 2'),
      insertUser('0047 Student 3'),
      insertUser('0047 Student 4'),
    ]);

    try {
      await env.DB.prepare(
        `INSERT INTO students (
          user_id, class_room_id, attendance_number, student_id_number
        ) VALUES (?, ?, 1, '0047-1')`
      )
        .bind(userIds[0], firstClassRoom.classRoomId)
        .run();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0047-2')`
        )
          .bind(userIds[1], firstClassRoom.classRoomId)
          .run()
      ).rejects.toThrow(/UNIQUE constraint failed/);

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, ?, 1, '0047-3')`
        )
          .bind(userIds[2], secondClassRoom.classRoomId)
          .run()
      ).resolves.toBeDefined();

      await expect(
        env.DB.prepare(
          `INSERT INTO students (
            user_id, class_room_id, attendance_number, student_id_number
          ) VALUES (?, NULL, NULL, '0047-4')`
        )
          .bind(userIds[3])
          .run()
      ).resolves.toBeDefined();
    } finally {
      await env.DB.prepare(
        `DELETE FROM students
         WHERE student_id_number LIKE '0047-%'`
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?, ?, ?)')
        .bind(...userIds)
        .run();
      await env.DB.prepare(
        `DELETE FROM class_rooms WHERE class_code IN ('0047-A', '0047-B')`
      ).run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id IN (?, ?)')
        .bind(firstClassRoom.teamId, secondClassRoom.teamId)
        .run();
    }
  });

  it('既存の重複を残したまま一意制約の追加を中断する', async () => {
    const classRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '0047-DUPLICATE',
      className: '0047 重複確認クラス',
    });
    const userIds = await Promise.all([
      insertUser('0047 Duplicate Student 1'),
      insertUser('0047 Duplicate Student 2'),
    ]);

    await env.DB.prepare(
      'DROP INDEX IF EXISTS ux_students_class_room_attendance'
    ).run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 40, '0047-DUPLICATE-1')`
      ).bind(userIds[0], classRoom.classRoomId),
      env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 40, '0047-DUPLICATE-2')`
      ).bind(userIds[1], classRoom.classRoomId),
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
        .bind(classRoom.classRoomId)
        .all<{ student_id_number: string }>();
      expect(duplicatedStudents.results).toEqual([
        { student_id_number: '0047-DUPLICATE-1' },
        { student_id_number: '0047-DUPLICATE-2' },
      ]);

      const uniqueIndex = await env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND name = 'ux_students_class_room_attendance'`
      ).first();
      expect(uniqueIndex).toBeNull();
    } finally {
      await env.DB.prepare(
        "DELETE FROM students WHERE student_id_number LIKE '0047-DUPLICATE-%'"
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?)')
        .bind(...userIds)
        .run();
      await env.DB.prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
        .bind(classRoom.classRoomId)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(classRoom.teamId)
        .run();
      await env.DB.prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS ux_students_class_room_attendance
         ON students (class_room_id, attendance_number)
         WHERE class_room_id IS NOT NULL`
      ).run();
      await env.DB.prepare(
        'DROP TABLE IF EXISTS __migration_0054_duplicate_guard'
      ).run();
    }
  });
});
