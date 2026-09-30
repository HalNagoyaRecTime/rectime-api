import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualNotificationAudience } from '../../../src/domain/entities/AdminNotification';
import { createAdminNotificationRepository } from '../../../src/infrastructure/repositories/AdminNotificationRepository';

interface Fixture {
  creatorId: number;
  classRoomId: number;
  gatheringId: number;
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
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, start_time, end_time) VALUES ('大縄跳び', '1000', '1030') RETURNING event_id"
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
    ).bind(first!.user_id, classroom!.class_room_id),
    env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, 'S002')"
    ).bind(second!.user_id, classroom!.class_room_id),
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
    classRoomId: classroom!.class_room_id,
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
  ] as const)('%sの対象と有効Token数を取得する', async (_, buildAudience) => {
    const fixture = await createFixture();
    const audience = buildAudience(fixture) as ManualNotificationAudience;

    await expect(repository.getAudienceStatus(audience)).resolves.toEqual({
      exists: true,
      active_token_count: 2,
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

  it('同じ競技の複数集合に所属する利用者を重複なく数える', async () => {
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

    await expect(
      repository.getAudienceStatus({
        type: 'event_participants',
        event_id: fixture.eventId,
      })
    ).resolves.toEqual({ exists: true, active_token_count: 2 });
  });

  it('対象が存在しても有効Tokenがなければ0件を返す', async () => {
    await createFixture();
    await env.DB.prepare(
      'UPDATE firebase_tokens SET is_firebase_active = 0'
    ).run();

    await expect(
      repository.getAudienceStatus({ type: 'all' })
    ).resolves.toEqual({ exists: true, active_token_count: 0 });
  });
});
