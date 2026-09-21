import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';

interface Fixture {
  classRoomId: number;
  activeStudentId: number;
  inactiveStudentId: number;
  generalUserId: number;
  teacherId: number;
  eventId: number;
  gatheringId: number;
  scheduleId: number;
}

async function createFixture(): Promise<Fixture> {
  const classRoom = await env.DB.prepare(
    "INSERT INTO class_rooms (class_code, class_name) VALUES ('R1', 'R組') RETURNING class_room_id"
  ).first<{ class_room_id: number }>();
  const activeStudent = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('有効な生徒') RETURNING user_id"
  ).first<{ user_id: number }>();
  const inactiveStudent = await env.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('無効な生徒', 0) RETURNING user_id"
  ).first<{ user_id: number }>();
  const generalUser = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('一般利用者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const teacher = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('教員') RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('運動会', '体育館', '0900', '1000') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(event!.event_id, spot!.gathering_spot_id)
    .first<{ gathering_id: number }>();
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '通知', '本文') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  const schedule = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, send_at, send_status) VALUES (?, '2026-09-21T09:00:00.000Z', 'scheduled') RETURNING notification_schedule_id"
  )
    .bind(notification!.notification_id)
    .first<{ notification_schedule_id: number }>();

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, ?)'
    ).bind(activeStudent!.user_id, classRoom!.class_room_id, 'R001'),
    env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, ?)'
    ).bind(inactiveStudent!.user_id, classRoom!.class_room_id, 'R002'),
    env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)').bind(
      teacher!.user_id,
      'teacher@example.com'
    ),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, activeStudent!.user_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, inactiveStudent!.user_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, generalUser!.user_id),
  ]);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type) VALUES (?, 'all')"
    ).bind(schedule!.notification_schedule_id),
    env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'class_room', ?)"
    ).bind(schedule!.notification_schedule_id, classRoom!.class_room_id),
    env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'gathering', ?)"
    ).bind(schedule!.notification_schedule_id, gathering!.gathering_id),
    env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'event', ?)"
    ).bind(schedule!.notification_schedule_id, event!.event_id),
    env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'user', ?)"
    ).bind(schedule!.notification_schedule_id, generalUser!.user_id),
  ]);

  return {
    classRoomId: classRoom!.class_room_id,
    activeStudentId: activeStudent!.user_id,
    inactiveStudentId: inactiveStudent!.user_id,
    generalUserId: generalUser!.user_id,
    teacherId: teacher!.user_id,
    eventId: event!.event_id,
    gatheringId: gathering!.gathering_id,
    scheduleId: schedule!.notification_schedule_id,
  };
}

describe('NotificationAudienceResolverRepository', () => {
  const repository = createNotificationAudienceResolverRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_audiences'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('期限到来したscheduledだけをresolvingへclaimする', async () => {
    const fixture = await createFixture();

    await expect(
      repository.claimScheduleForResolution(
        fixture.scheduleId,
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      repository.claimScheduleForResolution(
        fixture.scheduleId,
        '2026-09-21T09:02:00.000Z'
      )
    ).resolves.toBe(false);

    await expect(
      env.DB.prepare(
        'SELECT send_status, started_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toMatchObject({
      send_status: 'resolving',
      started_at: '2026-09-21T09:01:00.000Z',
    });
  });

  it('Audienceごとにactive userを解決し、class_roomは生徒だけを返す', async () => {
    const fixture = await createFixture();
    const audiences = await repository.findUnresolvedAudiences(
      fixture.scheduleId
    );

    const resolved = await Promise.all(
      audiences.map(async audience => ({
        type: audience.audienceType,
        userIds: await repository.findAudienceUserIds({
          audienceType:
            audience.audienceType === 'all' ? 'all' : audience.audienceType,
          targetId: audience.targetId,
        }),
      }))
    );

    expect(resolved).toEqual([
      {
        type: 'all',
        userIds: [
          fixture.activeStudentId,
          fixture.generalUserId,
          fixture.teacherId,
        ],
      },
      { type: 'class_room', userIds: [fixture.activeStudentId] },
      {
        type: 'gathering',
        userIds: [fixture.activeStudentId, fixture.generalUserId],
      },
      {
        type: 'event',
        userIds: [fixture.activeStudentId, fixture.generalUserId],
      },
      { type: 'user', userIds: [fixture.generalUserId] },
    ]);
    expect(resolved.flatMap(item => item.userIds)).not.toContain(
      fixture.inactiveStudentId
    );
  });

  it('Recipient登録とresolved更新を冪等に実行する', async () => {
    const fixture = await createFixture();
    const audiences = await repository.findUnresolvedAudiences(
      fixture.scheduleId
    );
    await repository.claimScheduleForResolution(
      fixture.scheduleId,
      '2026-09-21T09:00:00.000Z'
    );

    await repository.insertRecipients(fixture.scheduleId, [
      fixture.activeStudentId,
      fixture.activeStudentId,
      fixture.generalUserId,
    ]);
    await repository.insertRecipients(fixture.scheduleId, [
      fixture.activeStudentId,
      fixture.generalUserId,
    ]);

    const firstAudience = audiences[0]!;
    expect(
      await repository.markRecipientsResolved(
        fixture.scheduleId,
        '2026-09-21T09:01:00.000Z'
      )
    ).toBe(false);
    expect(
      await repository.markAudienceResolved(
        firstAudience.id,
        '2026-09-21T09:01:00.000Z'
      )
    ).toBe(true);
    expect(
      await repository.markAudienceResolved(
        firstAudience.id,
        '2026-09-21T09:02:00.000Z'
      )
    ).toBe(false);

    await env.DB.prepare(
      "UPDATE notification_audiences SET resolved_at = '2026-09-21T09:01:00.000Z' WHERE notification_schedule_id = ?"
    )
      .bind(fixture.scheduleId)
      .run();
    expect(
      await repository.markRecipientsResolved(
        fixture.scheduleId,
        '2026-09-21T09:03:00.000Z'
      )
    ).toBe(true);

    await expect(
      env.DB.prepare(
        'SELECT COUNT(*) AS count FROM notification_recipients WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first<{ count: number }>()
    ).resolves.toEqual({ count: 2 });
    await expect(
      env.DB.prepare(
        'SELECT recipients_resolved_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first()
    ).resolves.toEqual({
      recipients_resolved_at: '2026-09-21T09:03:00.000Z',
    });
  });
});
