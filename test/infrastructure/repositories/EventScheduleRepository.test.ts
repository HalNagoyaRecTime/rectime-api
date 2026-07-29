import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEventScheduleRepository } from '../../../src/infrastructure/repositories/EventScheduleRepository';

interface Fixture {
  userId: number;
  eventId: number;
  groupId: number;
}

async function createFixture(): Promise<Fixture> {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('参加者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id"
  ).first<{ event_id: number }>();
  const group = await env.DB.prepare(
    'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
  ).first<{ gathering_group_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
    ).bind(group!.gathering_group_id, event!.event_id, spot!.gathering_spot_id),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?)'
    ).bind(group!.gathering_group_id, user!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'participant-token')"
    ).bind(user!.user_id),
  ]);
  return {
    userId: user!.user_id,
    eventId: event!.event_id,
    groupId: group!.gathering_group_id,
  };
}

function buildInput(fixture: Fixture) {
  return {
    event_id: fixture.eventId,
    user_id: fixture.userId,
    event_name: '大縄跳び',
    rule_text: null,
    venue: '体育館',
    start_time: '1030',
    end_time: '1100',
    resolved_event_name: '大縄跳び',
    resolved_venue: '体育館',
    refresh_notifications: true,
    notification_enabled: true,
    send_at: '2026-11-07T01:15:00.000Z',
  };
}

describe('EventScheduleRepository', () => {
  const repository = createEventScheduleRepository(env.DB);
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM gathering_groups'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('イベント参加者のtokenごとに開始15分前のdraftを作成する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    const schedule = await env.DB.prepare(
      `SELECT ns.send_status, ns.importance, ns.send_at, ns.firebase_token_id, n.title, n.body
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ?`
    )
      .bind(fixture.eventId)
      .first();
    expect(schedule).toMatchObject({
      send_status: 'draft',
      importance: 2,
      send_at: '2026-11-07T01:15:00.000Z',
      title: '大縄跳び開始のお知らせ',
      body: '大縄跳びの開始時間が近づいています。該当チームは体育館へ集合してください。',
    });
  });

  it('競技基本情報と通知予定を同じbatchで更新する', async () => {
    const fixture = await createFixture();
    await repository.apply({
      ...buildInput(fixture),
      event_name: '大縄跳び決勝',
      rule_text: '決勝ルール',
      venue: 'メインアリーナ',
    });

    const updatedEvent = await env.DB.prepare(
      `SELECT event_name, rule_text, venue, start_time, end_time
       FROM events
       WHERE event_id = ?`
    )
      .bind(fixture.eventId)
      .first();
    expect(updatedEvent).toMatchObject({
      event_name: '大縄跳び決勝',
      rule_text: '決勝ルール',
      venue: 'メインアリーナ',
      start_time: '1030',
      end_time: '1100',
    });
  });

  it('一部の競技情報だけを更新し、未指定の値と既存draftを維持する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));

    await repository.apply({
      event_id: fixture.eventId,
      user_id: fixture.userId,
      venue: 'サブアリーナ',
      resolved_event_name: '大縄跳び',
      resolved_venue: 'サブアリーナ',
      refresh_notifications: false,
      notification_enabled: true,
      send_at: '2026-11-07T01:15:00.000Z',
    });

    const updatedEvent = await env.DB.prepare(
      `SELECT event_name, rule_text, venue, start_time, end_time
       FROM events
       WHERE event_id = ?`
    )
      .bind(fixture.eventId)
      .first();
    const schedules = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM notification_schedules
       WHERE event_id = ? AND send_status = 'draft'`
    )
      .bind(fixture.eventId)
      .first<{ count: number }>();

    expect(updatedEvent).toMatchObject({
      event_name: '大縄跳び',
      rule_text: null,
      venue: 'サブアリーナ',
      start_time: '1030',
      end_time: '1100',
    });
    expect(schedules?.count).toBe(1);
  });

  it('集合場所変更時はevents.venueを通知本文へ反映する', async () => {
    const fixture = await createFixture();

    await repository.apply({
      ...buildInput(fixture),
      venue: 'サブアリーナ',
      resolved_venue: 'サブアリーナ',
    });

    const notification = await env.DB.prepare(
      `SELECT n.body
       FROM notifications n
       INNER JOIN notification_schedules ns
         ON ns.notification_id = n.notification_id
       WHERE ns.event_id = ? AND ns.send_status = 'draft'`
    )
      .bind(fixture.eventId)
      .first<{ body: string }>();

    expect(notification?.body).toBe(
      '大縄跳びの開始時間が近づいています。該当チームはサブアリーナへ集合してください。'
    );
  });

  it('通知予定の作成に失敗した場合は競技基本情報も更新しない', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      `CREATE TRIGGER reject_event_reminder_schedule
       BEFORE INSERT ON notification_schedules
       BEGIN
         SELECT RAISE(ABORT, 'forced schedule failure');
       END`
    ).run();

    try {
      await expect(
        repository.apply({
          ...buildInput(fixture),
          event_name: '更新されない競技名',
          venue: '更新されない会場',
        })
      ).rejects.toThrow();
    } finally {
      await env.DB.prepare(
        'DROP TRIGGER IF EXISTS reject_event_reminder_schedule'
      ).run();
    }

    const event = await env.DB.prepare(
      'SELECT event_name, venue, start_time, end_time FROM events WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first();
    expect(event).toMatchObject({
      event_name: '大縄跳び',
      venue: '体育館',
      start_time: '1000',
      end_time: '1030',
    });
  });

  it('同じイベントを更新すると既存draftを削除して再生成する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    await repository.apply({
      ...buildInput(fixture),
      send_at: '2026-11-07T01:25:00.000Z',
    });
    const rows = await env.DB.prepare(
      "SELECT send_at FROM notification_schedules WHERE event_id = ? AND send_status = 'draft'"
    )
      .bind(fixture.eventId)
      .all();
    expect(rows.results).toEqual([{ send_at: '2026-11-07T01:25:00.000Z' }]);
  });

  it('同じイベントを並行更新してもtokenごとのdraftを重複させない', async () => {
    const fixture = await createFixture();

    await Promise.all([
      repository.apply(buildInput(fixture)),
      repository.apply(buildInput(fixture)),
    ]);

    const schedules = await env.DB.prepare(
      `SELECT firebase_token_id, COUNT(*) AS count
       FROM notification_schedules
       WHERE event_id = ? AND send_status = 'draft'
       GROUP BY firebase_token_id`
    )
      .bind(fixture.eventId)
      .all<{ firebase_token_id: number; count: number }>();
    const notifications = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE notification_type = 'event_reminder'`
    ).first<{ count: number }>();

    expect(schedules.results).toHaveLength(1);
    expect(schedules.results[0]?.count).toBe(1);
    expect(notifications?.count).toBe(1);
  });

  it('通知OFFではdraftと孤立した自動通知だけを削除する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    await repository.apply({
      ...buildInput(fixture),
      notification_enabled: false,
    });
    const schedules = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notification_schedules WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first<{ count: number }>();
    const notifications = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE notification_type = 'event_reminder'"
    ).first<{ count: number }>();
    expect(schedules?.count).toBe(0);
    expect(notifications?.count).toBe(0);
  });

  it('送信済み履歴は通知OFFでも保持する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'sent' WHERE event_id = ?"
    )
      .bind(fixture.eventId)
      .run();
    await repository.apply({
      ...buildInput(fixture),
      notification_enabled: false,
    });
    const history = await env.DB.prepare(
      'SELECT send_status FROM notification_schedules WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first();
    expect(history).toMatchObject({ send_status: 'sent' });
  });

  it('同じイベントの手動draft通知は時刻変更時も保持する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    const token = await env.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(fixture.userId)
      .first<{ firebase_token_id: number }>();
    const manual = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '手動通知', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id, event_id, notification_id, firebase_token_id,
         importance, send_status, send_at
       ) VALUES (?, ?, ?, ?, 2, 'draft', ?)`
    )
      .bind(
        fixture.userId,
        fixture.eventId,
        manual!.notification_id,
        token!.firebase_token_id,
        '2026-11-07T02:00:00.000Z'
      )
      .run();

    await repository.apply({
      ...buildInput(fixture),
      send_at: '2026-11-07T01:25:00.000Z',
    });

    const manualSchedule = await env.DB.prepare(
      `SELECT ns.send_status, ns.send_at
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ? AND n.notification_type = 'manual'`
    )
      .bind(fixture.eventId)
      .first();
    expect(manualSchedule).toMatchObject({
      send_status: 'draft',
      send_at: '2026-11-07T02:00:00.000Z',
    });
  });

  it('自動通知だけを競技単位で集約し、手動通知を除外する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    const token = await env.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(fixture.userId)
      .first<{ firebase_token_id: number }>();
    const manual = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '手動', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         event_id, notification_id, firebase_token_id, send_status, send_at
       ) VALUES (?, ?, ?, 'failed', ?)`
    )
      .bind(
        fixture.eventId,
        manual!.notification_id,
        token!.firebase_token_id,
        '2026-11-07T02:00:00.000Z'
      )
      .run();

    const summary = await repository.getNotificationSummary(fixture.eventId);
    expect(summary).toEqual({
      scheduled_at: '2026-11-07T01:15:00.000Z',
      total: 1,
      draft: 1,
      sending: 0,
      sent: 0,
      failed: 0,
    });
  });
});
