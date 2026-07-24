import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationScheduleRepository } from '../../../src/infrastructure/repositories/NotificationScheduleRepository';

describe('NotificationScheduleRepository', () => {
  const repository = createNotificationScheduleRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  async function createFixture(sendAt = '2026-07-23T09:00:00.000Z') {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知予定ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const token = await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'token-a') RETURNING firebase_token_id"
    )
      .bind(user!.user_id)
      .first<{ firebase_token_id: number }>();
    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const schedule = await repository.create({
      created_user_id: user!.user_id,
      event_id: event!.event_id,
      notification_id: notification!.notification_id,
      firebase_token_id: token!.firebase_token_id,
      importance: 2,
      send_at: sendAt,
    });
    return { user, event, token, notification, schedule };
  }

  it('token単位の通知予定を作成・詳細取得できる', async () => {
    const { schedule } = await createFixture();
    await expect(
      repository.findById(schedule.notification_schedule_id)
    ).resolves.toEqual(schedule);
    expect(schedule).toMatchObject({
      firebase_token_id: expect.any(Number),
      importance: 2,
      notification_type: 'manual',
      send_status: 'draft',
    });
  });

  it('作成者・競技・Firebaseトークンで一覧を絞り込む', async () => {
    const fixture = await createFixture();
    const result = await repository.findAll({
      send_status: 'draft',
      event_id: fixture.event!.event_id,
      created_user_id: fixture.user!.user_id,
      firebase_token_id: fixture.token!.firebase_token_id,
      limit: 10,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.notification_schedules[0].notification_schedule_id).toBe(
      fixture.schedule.notification_schedule_id
    );
  });

  it('draftのみ削除できる', async () => {
    const { schedule } = await createFixture();
    await expect(
      repository.deleteDraft(schedule.notification_schedule_id)
    ).resolves.toBe('deleted');
    await expect(
      repository.deleteDraft(schedule.notification_schedule_id)
    ).resolves.toBe('not_found');
  });

  it('期限到来したdraftをtoken情報付きで一度だけ確保する', async () => {
    const { schedule } = await createFixture();
    const first = await repository.claimDue('2026-07-23T09:05:00.000Z');
    const second = await repository.claimDue('2026-07-23T09:05:00.000Z');
    expect(first).toEqual([
      expect.objectContaining({
        notification_schedule_id: schedule.notification_schedule_id,
        fcm_token: 'token-a',
        is_firebase_active: 1,
        send_status: 'sending',
      }),
    ]);
    expect(second).toEqual([]);
  });
});
