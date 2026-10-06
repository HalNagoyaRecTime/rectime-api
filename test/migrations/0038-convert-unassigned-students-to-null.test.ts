import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0038_convert_unassigned_students_to_null.sql'
  );
  if (!migration) {
    throw new Error(
      '0038_convert_unassigned_students_to_null.sql is not registered'
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

describe('0038_convert_unassigned_students_to_null.sql', () => {
  it('__UNASSIGNED__所属のStudentだけを未所属へ移行する', async () => {
    let unassignedClassRoom = await env.DB.prepare(
      `SELECT class_room_id
       FROM class_rooms
       WHERE class_code = '__UNASSIGNED__'`
    ).first<{ class_room_id: number }>();
    if (!unassignedClassRoom) {
      unassignedClassRoom = await env.DB.prepare(
        `INSERT INTO class_rooms (class_code, class_name)
         VALUES ('__UNASSIGNED__', '未割当')
         RETURNING class_room_id`
      ).first<{ class_room_id: number }>();
    }

    const assignedClassRoom = await env.DB.prepare(
      `SELECT class_room_id
       FROM class_rooms
       WHERE class_room_id <> ?
       ORDER BY class_room_id
       LIMIT 1`
    )
      .bind(unassignedClassRoom!.class_room_id)
      .first<{ class_room_id: number }>();
    expect(assignedClassRoom).not.toBeNull();

    const unassignedUserId = await insertUser('0038旧未所属Student');
    const assignedUserId = await insertUser('0038所属Student');

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, ?, 1, ?)`
      ).bind(
        unassignedUserId,
        unassignedClassRoom!.class_room_id,
        '0038-UNASSIGNED'
      ),
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, ?, 2, ?)`
      ).bind(
        assignedUserId,
        assignedClassRoom!.class_room_id,
        '0038-ASSIGNED'
      ),
    ]);

    try {
      await runMigration();

      const students = await env.DB.prepare(
        `SELECT user_id, class_room_id, attendance_number
         FROM students
         WHERE user_id IN (?, ?)
         ORDER BY user_id`
      )
        .bind(unassignedUserId, assignedUserId)
        .all<{
          user_id: number;
          class_room_id: number | null;
          attendance_number: number | null;
        }>();

      expect(students.results).toEqual([
        {
          user_id: unassignedUserId,
          class_room_id: null,
          attendance_number: null,
        },
        {
          user_id: assignedUserId,
          class_room_id: assignedClassRoom!.class_room_id,
          attendance_number: 2,
        },
      ]);

      const remainingUnassignedClassRoom = await env.DB.prepare(
        `SELECT class_room_id
         FROM class_rooms
         WHERE class_code = '__UNASSIGNED__'`
      ).first();
      expect(remainingUnassignedClassRoom).toBeNull();
    } finally {
      await env.DB.prepare('DELETE FROM students WHERE user_id IN (?, ?)')
        .bind(unassignedUserId, assignedUserId)
        .run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?)')
        .bind(unassignedUserId, assignedUserId)
        .run();
    }
  });
});
