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
    "INSERT INTO users (user_name) VALUES ('更新担当者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id"
  ).first<{ event_id: number }>();
  const group = await env.DB.prepare(
    "INSERT INTO gathering_groups (gathering_group_name) VALUES ('A組') RETURNING gathering_group_id"
  ).first<{ gathering_group_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館前') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  await env.DB.prepare(
    'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
  )
    .bind(group!.gathering_group_id, event!.event_id, spot!.gathering_spot_id)
    .run();
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
    gathering_group_id: fixture.groupId,
    start_time: '1030',
    end_time: '1100',
    notification_enabled: true,
    notification_title: '大縄跳び開始のお知らせ',
    notification_body:
      '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
    send_at: '2026-11-07T01:15:00.000Z',
  };
}

describe('EventScheduleRepository', () => {
  const repository = createEventScheduleRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
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

  it('イベント時刻・通知内容・draft通知予定を1回のbatchで作成する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));

    const event = await env.DB.prepare(
      'SELECT start_time, end_time FROM events WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first();
    const schedule = await env.DB.prepare(
      `SELECT ns.send_status, ns.importance, ns.send_at, n.title, n.body
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ? AND ns.gathering_group_id = ?`
    )
      .bind(fixture.eventId, fixture.groupId)
      .first();

    expect(event).toMatchObject({ start_time: '1030', end_time: '1100' });
    expect(schedule).toMatchObject({
      send_status: 'draft',
      importance: 2,
      send_at: '2026-11-07T01:15:00.000Z',
      title: '大縄跳び開始のお知らせ',
    });
  });

  it('既存draftの本文と時刻を更新し、通知予定を増やさない', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    await repository.apply({
      ...buildInput(fixture),
      start_time: '1040',
      end_time: '1110',
      notification_title: '変更後タイトル',
      notification_body: '変更後本文',
      send_at: '2026-11-07T01:25:00.000Z',
    });

    const schedules = await env.DB.prepare(
      `SELECT ns.send_at, n.title, n.body
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ? AND ns.gathering_group_id = ? AND ns.send_status = 'draft'`
    )
      .bind(fixture.eventId, fixture.groupId)
      .all();
    expect(schedules.results).toEqual([
      {
        send_at: '2026-11-07T01:25:00.000Z',
        title: '変更後タイトル',
        body: '変更後本文',
      },
    ]);
  });

  it('通知なしへの変更ではdraftと参照されなくなった自動通知内容を削除する', async () => {
    const fixture = await createFixture();
    await repository.apply(buildInput(fixture));
    await repository.apply({
      ...buildInput(fixture),
      notification_enabled: false,
    });

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notification_schedules WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first<{ count: number }>();
    expect(count?.count).toBe(0);
    const notificationCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE notification_type = 'event_reminder'"
    ).first<{ count: number }>();
    expect(notificationCount?.count).toBe(0);
  });

  it('他のscheduleが参照する通知内容と送信履歴は削除しない', async () => {
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
      `SELECT ns.send_status, n.notification_type
       FROM notification_schedules ns
       INNER JOIN notifications n ON n.notification_id = ns.notification_id
       WHERE ns.event_id = ?`
    )
      .bind(fixture.eventId)
      .first();
    expect(history).toMatchObject({
      send_status: 'sent',
      notification_type: 'event_reminder',
    });
  });

  it('通知予定作成に失敗した場合はイベント時刻と通知内容もロールバックする', async () => {
    const fixture = await createFixture();

    await expect(
      repository.apply({ ...buildInput(fixture), user_id: 999999 })
    ).rejects.toThrow();

    const event = await env.DB.prepare(
      'SELECT start_time, end_time FROM events WHERE event_id = ?'
    )
      .bind(fixture.eventId)
      .first();
    const notificationCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notifications'
    ).first<{ count: number }>();
    expect(event).toMatchObject({ start_time: '1000', end_time: '1030' });
    expect(notificationCount?.count).toBe(0);
  });

  it('同時に通知ありを更新してもdraftを1件だけ作成する', async () => {
    const fixture = await createFixture();
    await Promise.all([
      repository.apply(buildInput(fixture)),
      repository.apply(buildInput(fixture)),
    ]);

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM notification_schedules
       WHERE event_id = ? AND gathering_group_id = ? AND send_status = 'draft'`
    )
      .bind(fixture.eventId, fixture.groupId)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });
});
