import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createNotificationAudienceResolverRepository } from '../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationScheduleQueryRepository } from '../../src/infrastructure/repositories/NotificationScheduleQueryRepository';
import { insertClassRoomWithTeam } from '../fixtures/classRooms';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0048_convert_unassigned_students_to_null.sql'
  );
  if (!migration) {
    throw new Error(
      '0048_convert_unassigned_students_to_null.sql is not registered'
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

describe('0048_convert_unassigned_students_to_null.sql', () => {
  it('__UNASSIGNED__所属のStudentだけを未所属へ移行する', async () => {
    let createdUnassignedTeamId: number | null = null;
    let unassignedClassRoom = await env.DB.prepare(
      `SELECT class_room_id
       FROM class_rooms
       WHERE class_code = '__UNASSIGNED__'`
    ).first<{ class_room_id: number }>();
    if (!unassignedClassRoom) {
      const created = await insertClassRoomWithTeam(env.DB, {
        classCode: '__UNASSIGNED__',
        className: '未割当',
      });
      createdUnassignedTeamId = created.teamId;
      unassignedClassRoom = { class_room_id: created.classRoomId };
    }

    const assignedClassRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '0048-A',
      className: '0048 Aクラス',
    });

    const unassignedUserId = await insertUser('0046旧未所属Student');
    const assignedUserId = await insertUser('0046所属Student');

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
        '0046-UNASSIGNED'
      ),
      env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, ?, 38002, ?)`
      ).bind(
        assignedUserId,
        assignedClassRoom.classRoomId,
        '0046-ASSIGNED'
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
          class_room_id: assignedClassRoom.classRoomId,
          attendance_number: 38002,
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
      await env.DB.prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
        .bind(assignedClassRoom.classRoomId)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(assignedClassRoom.teamId)
        .run();
      if (createdUnassignedTeamId !== null) {
        await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
          .bind(createdUnassignedTeamId)
          .run();
      }
    }
  });

  it('旧未割当クラス宛ての未解決予約通知を停止する', async () => {
    const unassignedClassRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: '__UNASSIGNED__',
      className: '未割当',
    });
    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         notification_type, push_title, push_body, title, body
       ) VALUES (
         'notification_general', '0046移行確認', '0046移行確認',
         '0046移行確認', '0046移行確認'
       )
       RETURNING notification_id`
    ).first<{ notification_id: number }>();
    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, importance, send_status, send_at
       ) VALUES (?, 2, 'scheduled', '2026-10-31T00:00:00.000Z')
       RETURNING notification_schedule_id`
    )
      .bind(notification!.notification_id)
      .first<{ notification_schedule_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_audiences (
         notification_schedule_id, audience_type, target_id
       ) VALUES (?, 'class_room', ?)`
    )
      .bind(
        schedule!.notification_schedule_id,
        unassignedClassRoom.classRoomId
      )
      .run();

    try {
      await runMigration();

      const migratedSchedule = await env.DB.prepare(
        `SELECT send_status, stopped_at, recipients_resolved_at, reason
         FROM notification_schedules
         WHERE notification_schedule_id = ?`
      )
        .bind(schedule!.notification_schedule_id)
        .first<{
          send_status: string;
          stopped_at: string | null;
          recipients_resolved_at: string | null;
          reason: string | null;
        }>();
      expect(migratedSchedule).toMatchObject({
        send_status: 'stopped',
        recipients_resolved_at: null,
        reason: 'source_deleted',
      });
      expect(migratedSchedule?.stopped_at).not.toBeNull();

      const queryRepository = createNotificationScheduleQueryRepository(
        env.DB
      );
      const queriedSchedule = await queryRepository.findById(
        schedule!.notification_schedule_id
      );
      expect(queriedSchedule?.stop).toMatchObject({
        reason: 'source_deleted',
        stopped_by: null,
      });

      const resolver = createNotificationAudienceResolverRepository(env.DB);
      const dueSchedules = await resolver.findDueCandidates(
        '2099-01-01T00:00:00.000Z',
        100
      );
      expect(dueSchedules).not.toContainEqual(
        expect.objectContaining({
          notification_schedule_id: schedule!.notification_schedule_id,
        })
      );
    } finally {
      await env.DB.prepare(
        'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(schedule!.notification_schedule_id)
        .run();
      await env.DB.prepare(
        'DELETE FROM notifications WHERE notification_id = ?'
      )
        .bind(notification!.notification_id)
        .run();
      await env.DB.prepare(
        "DELETE FROM class_rooms WHERE class_code = '__UNASSIGNED__'"
      ).run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(unassignedClassRoom.teamId)
        .run();
    }
  });
});
