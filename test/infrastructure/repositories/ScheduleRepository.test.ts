import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createScheduleRepository } from '../../../src/infrastructure/repositories/ScheduleRepository';

describe('ScheduleRepository', () => {
  const repository = createScheduleRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  async function createFixture() {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('更新対象ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('綱引き', 'グラウンド', '1030', '1100') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const gathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    const token = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?) RETURNING firebase_token_id'
    )
      .bind(user!.user_id, 'token-a')
      .first<{ firebase_token_id: number }>();
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gathering!.gathering_id, user!.user_id)
      .run();
    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();

    return {
      userId: user!.user_id,
      eventId: event!.event_id,
      gatheringId: gathering!.gathering_id,
      tokenId: token!.firebase_token_id,
      notificationId: notification!.notification_id,
    };
  }

  it('スケジュール一覧を取得する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         send_status,
         importance,
         send_at
       ) VALUES (?, ?, ?, ?, 'draft', 2, ?)`
    )
      .bind(
        fixture.userId,
        fixture.eventId,
        fixture.notificationId,
        fixture.tokenId,
        '2026-07-23T09:00:00.000Z'
      )
      .run();

    const all = await repository.findAll();

    expect(all.notification_schedules).toHaveLength(1);
    expect(all.notification_schedules[0]).toMatchObject({
      notification_id: fixture.notificationId,
      title: '件名',
      body: '本文',
      created_user: { user_id: fixture.userId },
      event: { event_id: fixture.eventId },
      delivery_summary: { total: 1, draft: 1 },
    });
  });

  it('draft通知を新しい送信時刻と対象tokenで再生成する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         send_status,
         importance,
         send_at
       ) VALUES (?, ?, ?, ?, 'draft', 2, ?)`
    )
      .bind(
        fixture.userId,
        fixture.eventId,
        fixture.notificationId,
        fixture.tokenId,
        '2026-07-23T09:00:00.000Z'
      )
      .run();

    const result = await repository.updateSchedule(fixture.notificationId, {
      create_user_id: fixture.userId,
      new_event_id: fixture.eventId,
      new_importance: 3,
      new_send_at: '2026-07-23T10:00:00.000Z',
      new_gathering_id: fixture.gatheringId,
    });

    const schedule = await env.DB.prepare(
      `SELECT created_user_id, event_id, notification_id, firebase_token_id, importance, send_status, send_at
       FROM notification_schedules
       WHERE notification_id = ?`
    )
      .bind(fixture.notificationId)
      .first<{
        created_user_id: number;
        event_id: number;
        notification_id: number;
        firebase_token_id: number;
        importance: number;
        send_status: string;
        send_at: string;
      }>();

    expect(result).toEqual({
      create_user_id: fixture.userId,
      new_event_id: fixture.eventId,
      new_importance: 3,
      new_send_at: '2026-07-23T10:00:00.000Z',
      new_gathering_id: fixture.gatheringId,
    });
    expect(schedule).toMatchObject({
      created_user_id: fixture.userId,
      event_id: fixture.eventId,
      notification_id: fixture.notificationId,
      firebase_token_id: fixture.tokenId,
      importance: 3,
      send_status: 'draft',
      send_at: '2026-07-23T10:00:00.000Z',
    });
  });

  it('draft以外の通知は更新できない', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         send_status,
         importance,
         send_at
       ) VALUES (?, ?, ?, ?, 'sent', 2, ?)`
    )
      .bind(
        fixture.userId,
        fixture.eventId,
        fixture.notificationId,
        fixture.tokenId,
        '2026-07-23T09:00:00.000Z'
      )
      .run();

    await expect(
      repository.updateSchedule(fixture.notificationId, {
        create_user_id: fixture.userId,
        new_event_id: fixture.eventId,
        new_importance: 3,
        new_send_at: '2026-07-23T10:00:00.000Z',
        new_gathering_id: fixture.gatheringId,
      })
    ).rejects.toThrow('Only schedules with "draft" status can be updated.');
  });
});
