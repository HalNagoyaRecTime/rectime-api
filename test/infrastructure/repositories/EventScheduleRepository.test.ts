import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEventScheduleRepository } from '../../../src/infrastructure/repositories/EventScheduleRepository';
import type { EventEntity } from '../../../src/domain/entities/Event';

interface Fixture {
  userId: number;
  eventId: number;
  gatheringId: number;
  event: EventEntity;
}

async function createFixture(): Promise<Fixture> {
  const user = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('参加者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id, event_name, rule_text, venue, start_time, end_time, created_at, updated_at"
  ).first<EventEntity>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(event!.event_id, spot!.gathering_spot_id)
    .first<{ gathering_id: number }>();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gathering!.gathering_id, user!.user_id),
    env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'participant-token')"
    ).bind(user!.user_id),
  ]);
  return {
    userId: user!.user_id,
    eventId: event!.event_id,
    gatheringId: gathering!.gathering_id,
    event: event!,
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
    expected_event: fixture.event,
    refresh_notifications: true,
    notification_enabled: true,
    send_at: '2026-11-07T01:15:00.000Z',
  };
}

async function getEventSnapshot(eventId: number): Promise<EventEntity> {
  const event = await env.DB.prepare(
    `SELECT
       event_id,
       event_name,
       rule_text,
       venue,
       start_time,
       end_time,
       created_at,
       updated_at
     FROM events
     WHERE event_id = ?`
  )
    .bind(eventId)
    .first<EventEntity>();
  if (!event) throw new Error('Event not found in test fixture');
  return event;
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
      body: '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
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
    const currentEvent = await getEventSnapshot(fixture.eventId);

    await repository.apply({
      event_id: fixture.eventId,
      user_id: fixture.userId,
      venue: 'サブアリーナ',
      expected_event: currentEvent,
      refresh_notifications: false,
      notification_enabled: true,
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

  it('同じ集合に登録した複数の利用者を通知対象にする', async () => {
    const fixture = await createFixture();
    const secondUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('参加者2') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
      ).bind(fixture.gatheringId, secondUser!.user_id),
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'participant-token-2')"
      ).bind(secondUser!.user_id),
    ]);

    await repository.apply(buildInput(fixture));

    const schedules = await env.DB.prepare(
      `SELECT ft.user_id
       FROM notification_schedules ns
       INNER JOIN firebase_tokens ft
         ON ft.firebase_token_id = ns.firebase_token_id
       WHERE ns.event_id = ?
       ORDER BY ft.user_id`
    )
      .bind(fixture.eventId)
      .all<{ user_id: number }>();
    expect(schedules.results).toEqual([
      { user_id: fixture.userId },
      { user_id: secondUser!.user_id },
    ]);
  });

  it('同じ競技に複数の集合がある場合も各集合の利用者へ通知する', async () => {
    const fixture = await createFixture();
    const secondUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('別集合の参加者') RETURNING user_id"
    ).first<{ user_id: number }>();
    const secondSpot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('正門前') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const secondGathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(fixture.eventId, secondSpot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
      ).bind(secondGathering!.gathering_id, secondUser!.user_id),
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'second-gathering-token')"
      ).bind(secondUser!.user_id),
    ]);

    await repository.apply(buildInput(fixture));

    const schedules = await env.DB.prepare(
      `SELECT ft.user_id, n.body
       FROM notification_schedules ns
       INNER JOIN firebase_tokens ft
         ON ft.firebase_token_id = ns.firebase_token_id
       INNER JOIN notifications n
         ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ?
       ORDER BY ft.user_id`
    )
      .bind(fixture.eventId)
      .all<{ user_id: number; body: string }>();
    expect(schedules.results).toEqual([
      {
        user_id: fixture.userId,
        body: '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
      },
      {
        user_id: secondUser!.user_id,
        body: '大縄跳びの開始時間が近づいています。該当チームは正門前へ集合してください。',
      },
    ]);
  });

  it('同じイベントを更新すると既存draftを削除して再生成する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    const currentEvent = await getEventSnapshot(fixture.eventId);
    await repository.apply({
      ...buildInput(fixture),
      expected_event: currentEvent,
      send_at: '2026-11-07T01:25:00.000Z',
    });
    const rows = await env.DB.prepare(
      "SELECT send_at FROM notification_schedules WHERE event_id = ? AND send_status = 'draft'"
    )
      .bind(fixture.eventId)
      .all();
    expect(rows.results).toEqual([{ send_at: '2026-11-07T01:25:00.000Z' }]);
  });

  it('同じイベントの並行更新は片方を競合として拒否し通知との不一致を防ぐ', async () => {
    const fixture = await createFixture();

    const results = await Promise.allSettled([
      repository.apply({
        ...buildInput(fixture),
        event_name: '大縄跳び決勝',
        start_time: undefined,
        end_time: undefined,
        send_at: '2026-11-07T00:45:00.000Z',
      }),
      repository.apply({
        ...buildInput(fixture),
        event_name: undefined,
        start_time: '1100',
        end_time: '1130',
        send_at: '2026-11-07T01:45:00.000Z',
      }),
    ]);
    expect(
      results.filter(result => result.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: new Error('Event update conflict'),
    });

    const state = await env.DB.prepare(
      `SELECT
         e.event_name,
         e.start_time,
         n.title,
         ns.send_at
       FROM events e
       INNER JOIN notification_schedules ns ON ns.event_id = e.event_id
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE e.event_id = ? AND ns.send_status = 'draft'`
    )
      .bind(fixture.eventId)
      .first<{
        event_name: string;
        start_time: string;
        title: string;
        send_at: string;
      }>();
    if (state?.event_name === '大縄跳び決勝') {
      expect(state).toMatchObject({
        start_time: '1000',
        title: '大縄跳び決勝開始のお知らせ',
        send_at: '2026-11-07T00:45:00.000Z',
      });
    } else {
      expect(state).toMatchObject({
        event_name: '大縄跳び',
        start_time: '1100',
        title: '大縄跳び開始のお知らせ',
        send_at: '2026-11-07T01:45:00.000Z',
      });
    }
  });

  it('通知OFFではdraftと孤立した自動通知だけを削除する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    const currentEvent = await getEventSnapshot(fixture.eventId);
    await repository.apply({
      ...buildInput(fixture),
      expected_event: currentEvent,
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
    const currentEvent = await getEventSnapshot(fixture.eventId);
    await repository.apply({
      ...buildInput(fixture),
      expected_event: currentEvent,
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

    const currentEvent = await getEventSnapshot(fixture.eventId);
    await repository.apply({
      ...buildInput(fixture),
      expected_event: currentEvent,
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
