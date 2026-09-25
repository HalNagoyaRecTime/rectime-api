import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CreateNotificationCommand,
  NotificationAudienceTarget,
} from '../../../src/domain/entities/AdminNotificationCommand';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';

const repository = createAdminNotificationCommandRepository(env.DB);

interface Fixture {
  actorUserId: number;
  classRoomId: number;
  gatheringId: number;
  eventId: number;
}

async function createFixture(): Promise<Fixture> {
  const actor = await env.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('通知Command管理者', 1) RETURNING user_id"
  ).first<{ user_id: number }>();
  const classRoom = await env.DB.prepare(
    "INSERT INTO class_rooms (class_code, class_name) VALUES ('NC1', '通知Command 1組') RETURNING class_room_id"
  ).first<{ class_room_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, start_time, end_time) VALUES ('通知Command行事', '1000', '1100') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('通知Command集合場所') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  if (!actor || !classRoom || !event || !spot) {
    throw new Error('通知Commandのfixture作成に失敗しました');
  }
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(event.event_id, spot.gathering_spot_id)
    .first<{ gathering_id: number }>();
  if (!gathering) throw new Error('通知Command集合の作成に失敗しました');

  return {
    actorUserId: actor.user_id,
    classRoomId: classRoom.class_room_id,
    gatheringId: gathering.gathering_id,
    eventId: event.event_id,
  };
}

function buildCommand(
  actorUserId: number,
  audiences: NotificationAudienceTarget[]
): CreateNotificationCommand {
  return {
    actor_user_id: actorUserId,
    push_title: 'Push title',
    push_body: 'Push body',
    detail_title: 'Detail title',
    detail_body: 'Detail body',
    importance: 'low',
    send_at: '2026-09-24T10:00:00.000Z',
    audiences,
    now: '2026-09-24T09:00:00.000Z',
  };
}

describe('AdminNotificationCommandRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_audiences'),
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

  it('Notification、Schedule、複数Audienceをまとめて作成し、Tokenなしも許可する', async () => {
    const fixture = await createFixture();
    const audiences: NotificationAudienceTarget[] = [
      { type: 'all', target_id: null },
      { type: 'class_room', target_id: fixture.classRoomId },
      { type: 'gathering', target_id: fixture.gatheringId },
      { type: 'event', target_id: fixture.eventId },
      { type: 'user', target_id: fixture.actorUserId },
    ];

    const created = await repository.create(
      buildCommand(fixture.actorUserId, audiences)
    );

    const root = await env.DB.prepare(
      `SELECT created_by_user_id, push_title, push_body, title, body,
              importance, notification_type, source_type, source_id, source_hash
       FROM notifications WHERE notification_id = ?`
    )
      .bind(created.notification_id)
      .first<Record<string, unknown>>();
    expect(root).toEqual({
      created_by_user_id: fixture.actorUserId,
      push_title: 'Push title',
      push_body: 'Push body',
      title: 'Detail title',
      body: 'Detail body',
      importance: 'low',
      notification_type: 'notification_general',
      source_type: null,
      source_id: null,
      source_hash: null,
    });

    const schedule = await env.DB.prepare(
      `SELECT created_user_id, scheduled_by_user_id, notification_id,
              importance, send_status, send_at, firebase_token_id
       FROM notification_schedules WHERE notification_schedule_id = ?`
    )
      .bind(created.notification_schedule_id)
      .first<Record<string, unknown>>();
    expect(schedule).toEqual({
      created_user_id: fixture.actorUserId,
      scheduled_by_user_id: fixture.actorUserId,
      notification_id: created.notification_id,
      importance: 1,
      send_status: 'scheduled',
      send_at: '2026-09-24T10:00:00.000Z',
      firebase_token_id: null,
    });

    const persistedAudiences = await env.DB.prepare(
      `SELECT audience_type, target_id FROM notification_audiences
       WHERE notification_schedule_id = ? ORDER BY audience_type`
    )
      .bind(created.notification_schedule_id)
      .all<{ audience_type: string; target_id: number | null }>();
    expect(persistedAudiences.results).toEqual([
      { audience_type: 'all', target_id: null },
      { audience_type: 'class_room', target_id: fixture.classRoomId },
      { audience_type: 'event', target_id: fixture.eventId },
      { audience_type: 'gathering', target_id: fixture.gatheringId },
      { audience_type: 'user', target_id: fixture.actorUserId },
    ]);

    const childCounts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notification_recipients
           WHERE notification_schedule_id = ?) AS recipients,
         (SELECT COUNT(*) FROM notification_push_deliveries d
           JOIN notification_recipients r USING (notification_recipient_id)
           WHERE r.notification_schedule_id = ?) AS deliveries`
    )
      .bind(created.notification_schedule_id, created.notification_schedule_id)
      .first<{ recipients: number; deliveries: number }>();
    expect(childCounts).toEqual({ recipients: 0, deliveries: 0 });
  });

  it('Audience挿入が失敗した場合はNotificationとScheduleも残さない', async () => {
    const fixture = await createFixture();
    const audience = { type: 'all', target_id: null } as const;

    await expect(
      repository.create(buildCommand(fixture.actorUserId, [audience, audience]))
    ).rejects.toThrow();

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications) AS notifications,
         (SELECT COUNT(*) FROM notification_schedules) AS schedules,
         (SELECT COUNT(*) FROM notification_audiences) AS audiences`
    ).first<{ notifications: number; schedules: number; audiences: number }>();
    expect(counts).toEqual({ notifications: 0, schedules: 0, audiences: 0 });
  });

  it('存在しない作成者で失敗した場合に一部の行を残さない', async () => {
    await expect(
      repository.create(
        buildCommand(999999, [{ type: 'all', target_id: null }])
      )
    ).rejects.toThrow();

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications) AS notifications,
         (SELECT COUNT(*) FROM notification_schedules) AS schedules,
         (SELECT COUNT(*) FROM notification_audiences) AS audiences`
    ).first<{ notifications: number; schedules: number; audiences: number }>();
    expect(counts).toEqual({ notifications: 0, schedules: 0, audiences: 0 });
  });

  it('Audience対象の存在をTokenの有無と分けて確認する', async () => {
    const fixture = await createFixture();

    await expect(
      repository.areAudienceTargetsAvailable([
        { type: 'class_room', target_id: fixture.classRoomId },
        { type: 'gathering', target_id: fixture.gatheringId },
        { type: 'event', target_id: fixture.eventId },
        { type: 'user', target_id: fixture.actorUserId },
        { type: 'all', target_id: null },
      ])
    ).resolves.toBe(true);
    await expect(
      repository.areAudienceTargetsAvailable([
        { type: 'user', target_id: 999999 },
      ])
    ).resolves.toBe(false);
  });

  it('手動通知をSchedule明示削除後に削除し、子行をCASCADEする', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (notification_schedule_id, user_id)
       VALUES (?, ?) RETURNING notification_recipient_id`
    )
      .bind(created.notification_schedule_id, fixture.actorUserId)
      .first<{ notification_recipient_id: number }>();
    const token = await env.DB.prepare(
      `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
       VALUES (?, 2, 'notification-command-token')
       RETURNING firebase_token_id`
    )
      .bind(fixture.actorUserId)
      .first<{ firebase_token_id: number }>();
    if (!recipient || !token)
      throw new Error('配信fixtureの作成に失敗しました');
    await env.DB.prepare(
      `INSERT INTO notification_push_deliveries
         (notification_recipient_id, firebase_token_id, platform, status)
       VALUES (?, ?, 2, 'pending')`
    )
      .bind(recipient.notification_recipient_id, token.firebase_token_id)
      .run();

    await expect(
      env.DB.prepare('DELETE FROM notifications WHERE notification_id = ?')
        .bind(created.notification_id)
        .run()
    ).rejects.toThrow();
    await expect(
      repository.deleteUnstartedManual(created.notification_id)
    ).resolves.toBe('deleted');

    const remaining = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications WHERE notification_id = ?) AS roots,
         (SELECT COUNT(*) FROM notification_schedules WHERE notification_schedule_id = ?) AS schedules,
         (SELECT COUNT(*) FROM notification_audiences WHERE notification_schedule_id = ?) AS audiences,
         (SELECT COUNT(*) FROM notification_recipients WHERE notification_schedule_id = ?) AS recipients,
         (SELECT COUNT(*) FROM notification_push_deliveries WHERE notification_recipient_id = ?) AS deliveries`
    )
      .bind(
        created.notification_id,
        created.notification_schedule_id,
        created.notification_schedule_id,
        created.notification_schedule_id,
        recipient.notification_recipient_id
      )
      .first<Record<string, number>>();
    expect(remaining).toEqual({
      roots: 0,
      schedules: 0,
      audiences: 0,
      recipients: 0,
      deliveries: 0,
    });
  });

  it('開始済みまたはautomatic通知の削除を拒否する', async () => {
    const fixture = await createFixture();
    const started = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      `UPDATE notification_schedules SET started_at = ?
       WHERE notification_schedule_id = ?`
    )
      .bind('2026-09-24T09:30:00.000Z', started.notification_schedule_id)
      .run();
    await expect(
      repository.deleteUnstartedManual(started.notification_id)
    ).resolves.toBe('not_allowed');

    const automatic = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      `UPDATE notifications
       SET source_type = 'gathering', source_id = ?, source_hash = ?
       WHERE notification_id = ?`
    )
      .bind(fixture.gatheringId, 'automatic-hash', automatic.notification_id)
      .run();
    await expect(
      repository.deleteUnstartedManual(automatic.notification_id)
    ).resolves.toBe('not_allowed');
  });

  it('未開始通知のpush/detail/importance/Audience/deliveryをまとめて更新する', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );

    await expect(
      repository.update({
        notification_id: created.notification_id,
        updated_at: '2026-09-24T11:00:00.000Z',
        push_title: '更新Push title',
        push_body: '更新Push body',
        detail_title: '更新Detail title',
        detail_body: '更新Detail body',
        importance: 'normal',
        schedule: {
          notification_schedule_id: created.notification_schedule_id,
          send_at: '2026-09-25T10:00:00.000Z',
          audiences: [
            { type: 'class_room', target_id: fixture.classRoomId },
            { type: 'event', target_id: fixture.eventId },
          ],
        },
        requires_unstarted_schedules: true,
      })
    ).resolves.toBe('updated');

    const root = await env.DB.prepare(
      `SELECT push_title, push_body, title, body, importance
       FROM notifications WHERE notification_id = ?`
    )
      .bind(created.notification_id)
      .first<Record<string, unknown>>();
    expect(root).toEqual({
      push_title: '更新Push title',
      push_body: '更新Push body',
      title: '更新Detail title',
      body: '更新Detail body',
      importance: 'normal',
    });
    const schedule = await env.DB.prepare(
      `SELECT send_at, importance FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(created.notification_schedule_id)
      .first<Record<string, unknown>>();
    expect(schedule).toEqual({
      send_at: '2026-09-25T10:00:00.000Z',
      importance: 2,
    });
    const audiences = await env.DB.prepare(
      `SELECT audience_type, target_id FROM notification_audiences
       WHERE notification_schedule_id = ? ORDER BY audience_type`
    )
      .bind(created.notification_schedule_id)
      .all<{ audience_type: string; target_id: number | null }>();
    expect(audiences.results).toEqual([
      { audience_type: 'class_room', target_id: fixture.classRoomId },
      { audience_type: 'event', target_id: fixture.eventId },
    ]);
  });

  it('Audience再作成が失敗した更新は全項目をロールバックする', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    const duplicateAudience = {
      type: 'class_room',
      target_id: fixture.classRoomId,
    } as const;

    await expect(
      repository.update({
        notification_id: created.notification_id,
        updated_at: '2026-09-24T11:00:00.000Z',
        push_title: 'rollback title',
        schedule: {
          notification_schedule_id: created.notification_schedule_id,
          send_at: '2026-09-25T10:00:00.000Z',
          audiences: [duplicateAudience, duplicateAudience],
        },
        requires_unstarted_schedules: true,
      })
    ).rejects.toThrow();

    const root = await env.DB.prepare(
      `SELECT push_title FROM notifications WHERE notification_id = ?`
    )
      .bind(created.notification_id)
      .first<{ push_title: string }>();
    const schedule = await env.DB.prepare(
      `SELECT send_at FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(created.notification_schedule_id)
      .first<{ send_at: string }>();
    const audiences = await env.DB.prepare(
      `SELECT audience_type, target_id FROM notification_audiences
       WHERE notification_schedule_id = ?`
    )
      .bind(created.notification_schedule_id)
      .all<{ audience_type: string; target_id: number | null }>();
    expect(root?.push_title).toBe('Push title');
    expect(schedule?.send_at).toBe('2026-09-24T10:00:00.000Z');
    expect(audiences.results).toEqual([
      { audience_type: 'all', target_id: null },
    ]);
  });
  it('Scheduleに属さないIDの更新は通知を変更しない', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    const result = await repository.update({
      notification_id: created.notification_id,
      updated_at: '2026-09-24T11:00:00.000Z',
      push_title: '変更後',
      schedule: {
        notification_schedule_id: created.notification_schedule_id + 100,
        send_at: '2026-09-25T10:00:00.000Z',
      },
      requires_unstarted_schedules: true,
    });
    expect(result).toBe('schedule_not_found');
    const root = await env.DB.prepare(
      'SELECT push_title FROM notifications WHERE notification_id = ?'
    )
      .bind(created.notification_id)
      .first<{ push_title: string }>();
    expect(root?.push_title).toBe('Push title');
  });
  it('詳細でRecipient単位集計とSource labelを返し、Audienceを一括取得する', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [
        { type: 'gathering', target_id: fixture.gatheringId },
      ])
    );
    await env.DB.prepare(
      "UPDATE notifications SET source_type = 'gathering', source_id = ?, source_hash = 'test-source' WHERE notification_id = ?"
    )
      .bind(fixture.gatheringId, created.notification_id)
      .run();

    const secondSchedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, event_id, notification_id, importance, send_status, send_at, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, 'scheduled', ?, ?, ?) RETURNING notification_schedule_id"
    )
      .bind(
        fixture.actorUserId,
        fixture.actorUserId,
        created.notification_id,
        '2026-09-24T11:00:00.000Z',
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .first<{ notification_schedule_id: number }>();
    if (!secondSchedule) throw new Error('追加Scheduleを作成できませんでした');

    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id, created_at, updated_at) VALUES (?, 'user', ?, ?, ?)"
    )
      .bind(
        secondSchedule.notification_schedule_id,
        fixture.actorUserId,
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .run();

    const recipientUserIds = [fixture.actorUserId];
    for (let index = 1; index < 4; index += 1) {
      const user = await env.DB.prepare(
        'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
      )
        .bind('通知Command集計対象 ' + index)
        .first<{ user_id: number }>();
      if (!user) throw new Error('集計対象Userを作成できませんでした');
      recipientUserIds.push(user.user_id);
    }

    const recipientIds: number[] = [];
    for (const userId of recipientUserIds) {
      const recipient = await env.DB.prepare(
        'INSERT INTO notification_recipients (notification_schedule_id, user_id, created_at) VALUES (?, ?, ?) RETURNING notification_recipient_id'
      )
        .bind(
          created.notification_schedule_id,
          userId,
          '2026-09-24T09:00:00.000Z'
        )
        .first<{ notification_recipient_id: number }>();
      if (!recipient) throw new Error('Recipientを作成できませんでした');
      recipientIds.push(recipient.notification_recipient_id);
    }

    const deliveryStatuses: Array<[number, string]> = [
      [0, 'pending'],
      [1, 'retry_wait'],
      [1, 'stopped'],
      [3, 'sent'],
      [3, 'failed'],
    ];
    for (const [recipientIndex, status] of deliveryStatuses) {
      await env.DB.prepare(
        'INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, created_at, updated_at) VALUES (?, NULL, 1, ?, 0, ?, ?)'
      )
        .bind(
          recipientIds[recipientIndex],
          status,
          '2026-09-24T09:00:00.000Z',
          '2026-09-24T09:00:00.000Z'
        )
        .run();
    }

    let audienceQueryCount = 0;
    const countedDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'prepare') {
          return (query: string) => {
            if (query.includes('FROM notification_audiences a')) {
              audienceQueryCount += 1;
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const detail = await createAdminNotificationCommandRepository(
      countedDb
    ).findDetail(created.notification_id);
    if (!detail) throw new Error('作成したNotification detailがありません');

    expect(detail.schedules).toHaveLength(2);
    expect(audienceQueryCount).toBe(1);
    expect(detail.source_label).toBe('通知Command集合場所');
    expect(detail.schedules[0]).toMatchObject({
      recipient_count: 4,
      success_count: 1,
      failed_count: 2,
      no_push_target_count: 1,
    });

    await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
      .bind(fixture.gatheringId)
      .run();
    const afterSourceDelete = await repository.findDetail(
      created.notification_id
    );
    expect(afterSourceDelete?.source_label).toBeNull();
  });
});
