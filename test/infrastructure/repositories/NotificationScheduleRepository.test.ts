import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createNotificationScheduleRepository } from '../../../src/infrastructure/repositories/NotificationScheduleRepository';

let sequence = 0;

describe('NotificationScheduleRepository', () => {
  const repository = createNotificationScheduleRepository(env.DB);
  const scheduleIds: number[] = [];
  const firebaseTokenIds: number[] = [];
  const gatheringGroupMemberIds: number[] = [];
  const gatheringIds: number[] = [];
  const notificationIds: number[] = [];
  const groupIds: number[] = [];
  const spotIds: number[] = [];
  const eventIds: number[] = [];
  const userIds: number[] = [];

  async function createFixture(options: {
    sendAt: string;
    status?: 'draft' | 'sending' | 'sent' | 'failed';
  }) {
    sequence += 1;
    const suffix = `${sequence}`;
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(`通知予定テストユーザー-${suffix}`)
      .first<{ user_id: number }>();
    userIds.push(user!.user_id);

    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(`通知予定テスト競技-${suffix}`, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);

    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    )
      .first<{ gathering_group_id: number }>();
    groupIds.push(group!.gathering_group_id);

    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`通知予定テスト場所-${suffix}`)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(spot!.gathering_spot_id);

    const gathering = await env.DB.prepare(
      'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?) RETURNING gathering_id'
    )
      .bind(group!.gathering_group_id, event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    gatheringIds.push(gathering!.gathering_id);

    const notification = await env.DB.prepare(
      'INSERT INTO notifications (notification_type, title, body) VALUES (?, ?, ?) RETURNING notification_id'
    )
      .bind(
        'manual',
        `通知予定テスト-${suffix}`,
        `通知予定テスト本文-${suffix}`
      )
      .first<{ notification_id: number }>();
    notificationIds.push(notification!.notification_id);

    const schedule = await repository.create({
      user_id: user!.user_id,
      event_id: event!.event_id,
      gathering_group_id: group!.gathering_group_id,
      notification_id: notification!.notification_id,
      importance: 2,
      send_at: options.sendAt,
    });
    scheduleIds.push(schedule.notification_send_schedule_id);

    if (options.status && options.status !== 'draft') {
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_status = ? WHERE notification_send_schedule_id = ?'
      )
        .bind(options.status, schedule.notification_send_schedule_id)
        .run();
    }

    return {
      schedule,
      userId: user!.user_id,
      eventId: event!.event_id,
      groupId: group!.gathering_group_id,
    };
  }

  afterEach(async () => {
    for (const id of scheduleIds) {
      await env.DB.prepare(
        'DELETE FROM notification_schedules WHERE notification_send_schedule_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of firebaseTokenIds) {
      await env.DB.prepare(
        'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of gatheringGroupMemberIds) {
      await env.DB.prepare(
        'DELETE FROM gathering_group_members WHERE gathering_group_member_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of gatheringIds) {
      await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
        .bind(id)
        .run();
    }
    for (const id of notificationIds) {
      await env.DB.prepare(
        'DELETE FROM notifications WHERE notification_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of groupIds) {
      await env.DB.prepare(
        'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of spotIds) {
      await env.DB.prepare(
        'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
      )
        .bind(id)
        .run();
    }
    for (const id of eventIds) {
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(id)
        .run();
    }
    for (const id of userIds) {
      await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(id)
        .run();
    }
    scheduleIds.length = 0;
    firebaseTokenIds.length = 0;
    gatheringGroupMemberIds.length = 0;
    gatheringIds.length = 0;
    notificationIds.length = 0;
    groupIds.length = 0;
    spotIds.length = 0;
    eventIds.length = 0;
    userIds.length = 0;
  });

  it('通知内容を結合した通知予定を作成・詳細取得できる', async () => {
    const { schedule } = await createFixture({
      sendAt: '2026-07-23T09:00:00.000Z',
    });

    const found = await repository.findById(
      schedule.notification_send_schedule_id
    );

    expect(found).toEqual(schedule);
    expect(found).toMatchObject({
      importance: 2,
      notification_type: 'manual',
      send_status: 'draft',
    });
  });

  it('状態・競技・グループ・期間で絞り込み、totalとページを返す', async () => {
    const target = await createFixture({
      sendAt: '2026-07-23T18:00:00+09:00',
    });
    await createFixture({
      sendAt: '2026-07-23T09:10:00.000Z',
      status: 'sent',
    });

    const result = await repository.findAll({
      send_status: 'draft',
      event_id: target.eventId,
      gathering_group_id: target.groupId,
      from: '2026-07-23T08:30:00.000Z',
      to: '2026-07-23T09:30:00.000Z',
      limit: 1,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.notification_schedules).toHaveLength(1);
    expect(result.notification_schedules[0].notification_send_schedule_id).toBe(
      target.schedule.notification_send_schedule_id
    );
  });

  it('limitとoffsetを一覧へ適用し、全件数は維持する', async () => {
    const first = await createFixture({
      sendAt: '2026-07-23T09:00:00.000Z',
    });
    const second = await createFixture({
      sendAt: '2026-07-23T09:05:00.000Z',
    });

    const result = await repository.findAll({ limit: 1, offset: 1 });

    expect(result.total).toBe(2);
    expect(
      result.notification_schedules.map(
        item => item.notification_send_schedule_id
      )
    ).toEqual([second.schedule.notification_send_schedule_id]);
    expect(
      result.notification_schedules[0].notification_send_schedule_id
    ).not.toBe(first.schedule.notification_send_schedule_id);
  });

  it('draftのみ削除し、存在しない予定と送信中予定を区別する', async () => {
    const draft = await createFixture({
      sendAt: '2026-07-23T09:00:00.000Z',
    });
    const sending = await createFixture({
      sendAt: '2026-07-23T09:05:00.000Z',
      status: 'sending',
    });

    await expect(
      repository.deleteDraft(draft.schedule.notification_send_schedule_id)
    ).resolves.toBe('deleted');
    await expect(
      repository.deleteDraft(sending.schedule.notification_send_schedule_id)
    ).resolves.toBe('not_draft');
    await expect(repository.deleteDraft(999999)).resolves.toBe('not_found');
  });

  it('期限到来したdraftのみ一括確保し、同じ予定を再取得しない', async () => {
    const due = await createFixture({
      sendAt: '2026-07-23T09:00:00.000Z',
    });
    await createFixture({ sendAt: '2026-07-23T09:10:00.000Z' });
    await createFixture({
      sendAt: '2026-07-23T08:50:00.000Z',
      status: 'sent',
    });

    const firstClaim = await repository.claimDue('2026-07-23T09:05:00.000Z');
    const secondClaim = await repository.claimDue('2026-07-23T09:05:00.000Z');

    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({
      notification_send_schedule_id: due.schedule.notification_send_schedule_id,
      send_status: 'sending',
    });
    expect(secondClaim).toEqual([]);
  });

  it('複数グループの有効なFirebaseトークンを一括取得する', async () => {
    const first = await createFixture({
      sendAt: '2026-07-23T09:00:00.000Z',
    });
    const second = await createFixture({
      sendAt: '2026-07-23T09:05:00.000Z',
    });

    for (const [fixture, token, active] of [
      [first, 'active-token-1', 1],
      [second, 'inactive-token-2', 0],
    ] as const) {
      const member = await env.DB.prepare(
        'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?) RETURNING gathering_group_member_id'
      )
        .bind(fixture.groupId, fixture.userId)
        .first<{ gathering_group_member_id: number }>();
      gatheringGroupMemberIds.push(member!.gathering_group_member_id);
      const firebaseToken = await env.DB.prepare(
        'INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active) VALUES (?, ?, ?, ?) RETURNING firebase_token_id'
      )
        .bind(fixture.userId, 2, token, active)
        .first<{ firebase_token_id: number }>();
      firebaseTokenIds.push(firebaseToken!.firebase_token_id);
    }

    const tokens = await repository.findTargetTokensByGatheringGroupIds([
      first.groupId,
      second.groupId,
    ]);

    expect(tokens).toEqual([
      {
        gathering_group_id: first.groupId,
        firebase_token_id: firebaseTokenIds[0],
        fcm_token: 'active-token-1',
      },
    ]);
  });
});
