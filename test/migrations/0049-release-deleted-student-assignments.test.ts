import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { insertClassRoomWithTeam } from '../fixtures/classRooms';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0049_release_deleted_student_assignments.sql'
  );
  if (!migration) {
    throw new Error(
      '0049_release_deleted_student_assignments.sql is not registered'
    );
  }
  return migration.queries;
})();

const uniqueConstraintMigrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0050_enforce_unique_student_attendance_number.sql'
  );
  if (!migration) {
    throw new Error(
      '0050_enforce_unique_student_attendance_number.sql is not registered'
    );
  }
  return migration.queries;
})();

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0049_release_deleted_student_assignments.sql', () => {
  it('退会済みStudentの所属情報だけを解放し、同じ出席番号を再利用できる', async () => {
    const classRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '0049-A',
      className: '0049 Aクラス',
    });
    const deletedUser = await env.DB.prepare(
      `INSERT INTO users (user_name, deletion_status)
      VALUES ('0049 退会済み', 'deleted')
       RETURNING user_id`
    ).first<{ user_id: number }>();
    const replacementUser = await env.DB.prepare(
      `INSERT INTO users (user_name)
      VALUES ('0049 再登録')
       RETURNING user_id`
    ).first<{ user_id: number }>();

    try {
      await env.DB.prepare(
        'DROP INDEX IF EXISTS ux_students_class_room_attendance'
      ).run();
      await env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 5, '0049-DELETED')`
      )
        .bind(deletedUser!.user_id, classRoom.classRoomId)
        .run();
      await env.DB.prepare(
        `INSERT INTO students (
           user_id, class_room_id, attendance_number, student_id_number
         ) VALUES (?, ?, 5, '0049-RECREATED')`
      )
        .bind(replacementUser!.user_id, classRoom.classRoomId)
        .run();

      await runMigration();
      await env.DB.batch(
        uniqueConstraintMigrationQueries.map(query => env.DB.prepare(query))
      );

      const deletedStudent = await env.DB.prepare(
        `SELECT class_room_id, attendance_number
         FROM students
         WHERE user_id = ?`
      )
        .bind(deletedUser!.user_id)
        .first<{
          class_room_id: number | null;
          attendance_number: number | null;
        }>();
      expect(deletedStudent).toEqual({
        class_room_id: null,
        attendance_number: null,
      });

      const activeStudent = await env.DB.prepare(
        `SELECT class_room_id, attendance_number
         FROM students
         WHERE user_id = ?`
      )
        .bind(replacementUser!.user_id)
        .first<{
          class_room_id: number | null;
          attendance_number: number | null;
        }>();
      expect(activeStudent).toEqual({
        class_room_id: classRoom.classRoomId,
        attendance_number: 5,
      });
    } finally {
      await env.DB.prepare(
        "DELETE FROM students WHERE student_id_number LIKE '0049-%'"
      ).run();
      await env.DB.prepare('DELETE FROM users WHERE user_id IN (?, ?)')
        .bind(deletedUser!.user_id, replacementUser!.user_id)
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
    }
  });
});
