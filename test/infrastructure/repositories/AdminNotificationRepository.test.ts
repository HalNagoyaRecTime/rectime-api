import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualNotificationAudience } from '../../../src/domain/entities/AdminNotification';
import { createAdminNotificationRepository } from '../../../src/infrastructure/repositories/AdminNotificationRepository';
import { insertClassRoomWithTeam } from '../../fixtures/classRooms';

interface Fixture {
  creatorId: number;
  classRoomId: number;
  gatheringId: number;
  eventId: number;
}

async function createFixture(): Promise<Fixture> {
  const classroom = await insertClassRoomWithTeam(env.DB, {
    classCode: 'A1',
    className: 'A組',
  });
  const creator = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('管理者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const first = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('参加者1') RETURNING user_id"
  ).first<{ user_id: number }>();
  const second = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('参加者2') RETURNING user_id"
  ).first<{ user_id: number }>();
  const inactive = await env.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('無効利用者', 0) RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(event!.event_id, spot!.gathering_spot_id)
    .first<{ gathering_id: number }>();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)').bind(
      creator!.user_id
    ),
    env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, 'S001')"
    ).bind(first!.user_id, classroom.classRoomId),
    env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, 'S002')"
    ).bind(second!.user_id, classroom.classRoomId),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, first!.user_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, second!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'token-1')"
    ).bind(first!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'token-2')"
    ).bind(second!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'inactive-user-token')"
    ).bind(inactive!.user_id),
  ]);

  return {
    creatorId: creator!.user_id,
    classRoomId: classroom.classRoomId,
    gatheringId: gathering!.gathering_id,
    eventId: event!.event_id,
  };
}

describe('AdminNotificationRepository', () => {
  const repository = createAdminNotificationRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM team_scores'),
      env.DB.prepare('DELETE FROM teams'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it.each([
    ['all', (_fixture: Fixture) => ({ type: 'all' })],
    [
      'class_room',
      (fixture: Fixture) => ({
        type: 'class_room',
        class_room_id: fixture.classRoomId,
      }),
    ],
    [
      'gathering',
      (fixture: Fixture) => ({
        type: 'gathering',
        gathering_id: fixture.gatheringId,
      }),
    ],
    [
      'event_participants',
      (fixture: Fixture) => ({
        type: 'event_participants',
        event_id: fixture.eventId,
      }),
    ],
  ] as const)('%sの有効Tokenを一括解決する', async (_, buildAudience) => {
    const fixture = await createFixture();
    const audience = buildAudience(fixture) as ManualNotificationAudience;

    await expect(repository.getAudienceStatus(audience)).resolves.toEqual({
      exists: true,
      active_token_count: 2,
    });

    const result = await repository.create({
      created_user_id: fixture.creatorId,
      title: '集合場所のお知らせ',
      body: '体育館前へ集合してください。',
      audience,
      scheduled_at: '2026-07-23T09:00:00+09:00',
    });

    expect(result).toMatchObject({
      notification_type: 'manual',
      schedule_count: 2,
      send_status: 'draft',
      importance: 2,
    });
    const rows = await env.DB.prepare(
      `SELECT
         ns.created_user_id,
         ns.event_id,
         ns.importance,
         ns.send_status,
         ns.send_at,
         n.notification_type,
         n.title,
         n.body
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.notification_id = ?
       ORDER BY ns.firebase_token_id`
    )
      .bind(result.notification_id)
      .all();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]).toMatchObject({
      created_user_id: fixture.creatorId,
      event_id: audience.type === 'event_participants' ? fixture.eventId : null,
      importance: 2,
      send_status: 'draft',
      send_at: '2026-07-23T09:00:00+09:00',
      notification_type: 'manual',
      title: '集合場所のお知らせ',
      body: '体育館前へ集合してください。',
    });
  });

  it('存在しない対象とTokenがない対象を区別する', async () => {
    const fixture = await createFixture();
    const emptyGathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) SELECT event_id, gathering_spot_id FROM gatherings LIMIT 1 RETURNING gathering_id'
    ).first<{ gathering_id: number }>();

    await expect(
      repository.getAudienceStatus({
        type: 'gathering',
        gathering_id: 999999,
      })
    ).resolves.toEqual({ exists: false, active_token_count: 0 });
    await expect(
      repository.getAudienceStatus({
        type: 'gathering',
        gathering_id: emptyGathering!.gathering_id,
      })
    ).resolves.toEqual({ exists: true, active_token_count: 0 });
    expect(fixture.gatheringId).toBeGreaterThan(0);
  });

  it('同じ競技の複数集合に所属する利用者へ通知予定を重複作成しない', async () => {
    const fixture = await createFixture();
    const secondGathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) SELECT event_id, gathering_spot_id FROM gatherings WHERE gathering_id = ? RETURNING gathering_id'
    )
      .bind(fixture.gatheringId)
      .first<{ gathering_id: number }>();
    await env.DB.prepare(
      `INSERT INTO gathering_group_members (gathering_id, user_id)
       SELECT ?, user_id
       FROM gathering_group_members
       WHERE gathering_id = ?`
    )
      .bind(secondGathering!.gathering_id, fixture.gatheringId)
      .run();

    const result = await repository.create({
      created_user_id: fixture.creatorId,
      title: '競技参加者へのお知らせ',
      body: '集合時間を確認してください。',
      audience: {
        type: 'event_participants',
        event_id: fixture.eventId,
      },
      scheduled_at: '2026-07-23T09:00:00+09:00',
    });

    expect(result.schedule_count).toBe(2);
  });

  it('作成直前に対象Tokenが無効化されても孤立した通知本文を残さない', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      'UPDATE firebase_tokens SET is_firebase_active = 0'
    ).run();

    await expect(
      repository.create({
        created_user_id: fixture.creatorId,
        title: '集合場所のお知らせ',
        body: '体育館前へ集合してください。',
        audience: { type: 'all' },
        scheduled_at: '2026-07-23T09:00:00+09:00',
      })
    ).rejects.toThrow('Failed to create manual notification');

    const notification = await env.DB.prepare(
      "SELECT notification_id FROM notifications WHERE notification_type = 'manual'"
    ).first();
    expect(notification).toBeNull();
  });
});
