import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualNotificationAudience } from '../../../src/domain/entities/AdminNotification';
import { createAdminNotificationRepository } from '../../../src/infrastructure/repositories/AdminNotificationRepository';

interface Fixture {
  creatorId: number;
  classRoomId: number;
  gatheringGroupId: number;
  eventId: number;
}

async function createFixture(): Promise<Fixture> {
  const classroom = await env.DB.prepare(
    "INSERT INTO class_rooms (class_code, class_name) VALUES ('A1', 'A組') RETURNING class_room_id"
  ).first<{ class_room_id: number }>();
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
  const group = await env.DB.prepare(
    'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
  ).first<{ gathering_group_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)').bind(
      creator!.user_id
    ),
    env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, 'S001')"
    ).bind(first!.user_id, classroom!.class_room_id),
    env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, 'S002')"
    ).bind(second!.user_id, classroom!.class_room_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?)'
    ).bind(group!.gathering_group_id, first!.user_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?)'
    ).bind(group!.gathering_group_id, second!.user_id),
    env.DB.prepare(
      'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
    ).bind(group!.gathering_group_id, event!.event_id, spot!.gathering_spot_id),
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
    classRoomId: classroom!.class_room_id,
    gatheringGroupId: group!.gathering_group_id,
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
      env.DB.prepare('DELETE FROM gathering_groups'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
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
      'gathering_group',
      (fixture: Fixture) => ({
        type: 'gathering_group',
        gathering_group_id: fixture.gatheringGroupId,
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
    const emptyGroup = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();

    await expect(
      repository.getAudienceStatus({
        type: 'gathering_group',
        gathering_group_id: 999999,
      })
    ).resolves.toEqual({ exists: false, active_token_count: 0 });
    await expect(
      repository.getAudienceStatus({
        type: 'gathering_group',
        gathering_group_id: emptyGroup!.gathering_group_id,
      })
    ).resolves.toEqual({ exists: true, active_token_count: 0 });
    expect(fixture.gatheringGroupId).toBeGreaterThan(0);
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
