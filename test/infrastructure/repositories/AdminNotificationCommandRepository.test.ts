import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NotificationAudienceTarget } from '../../../src/domain/entities/AdminNotificationCommand';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import {
  buildCommand,
  createFixture,
} from './adminNotificationRepositoryFixtures';

const repository = createAdminNotificationCommandRepository(env.DB);

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
      env.DB.prepare('DELETE FROM team_scores'),
      env.DB.prepare('DELETE FROM teams'),
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
    expect(created.notification_id).toBeGreaterThan(0);
    expect(created.notification_schedule_id).toBeGreaterThan(0);

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

  it('空Audienceではbatchを実行せず作成しない', async () => {
    const fixture = await createFixture();

    await expect(
      repository.create(buildCommand(fixture.actorUserId, []))
    ).rejects.toThrow('Audienceは1件以上必要です');

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications) AS notifications,
         (SELECT COUNT(*) FROM notification_schedules) AS schedules,
         (SELECT COUNT(*) FROM notification_audiences) AS audiences`
    ).first<{ notifications: number; schedules: number; audiences: number }>();
    expect(counts).toEqual({ notifications: 0, schedules: 0, audiences: 0 });
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

  it('別Schedule開始済みの競合ではPATCH更新を一切残さない', async () => {
    const fixture = await createFixture();
    const created = await repository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    const secondSchedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id, scheduled_by_user_id, event_id, notification_id,
         importance, send_status, send_at, created_at, updated_at
       ) VALUES (?, ?, NULL, ?, 1, 'scheduled', ?, ?, ?)
       RETURNING notification_schedule_id`
    )
      .bind(
        fixture.actorUserId,
        fixture.actorUserId,
        created.notification_id,
        '2026-09-26T10:00:00.000Z',
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .first<{ notification_schedule_id: number }>();
    if (!secondSchedule) throw new Error('追加Scheduleを作成できませんでした');

    const secondScheduleStartedAt = '2026-09-24T09:30:00.000Z';
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE notification_schedules SET started_at = ?
         WHERE notification_schedule_id = ?`
      ).bind(secondScheduleStartedAt, secondSchedule.notification_schedule_id),
      env.DB.prepare(
        `INSERT INTO notification_audiences (
           notification_schedule_id, audience_type, target_id, created_at, updated_at
         ) VALUES (?, 'class_room', ?, ?, ?)`
      ).bind(
        secondSchedule.notification_schedule_id,
        fixture.classRoomId,
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      ),
    ]);

    await expect(
      repository.update({
        notification_id: created.notification_id,
        updated_at: '2026-09-24T11:00:00.000Z',
        push_title: '競合後のPush title',
        importance: 'normal',
        schedule: {
          notification_schedule_id: created.notification_schedule_id,
          send_at: '2026-09-27T10:00:00.000Z',
          audiences: [{ type: 'user', target_id: fixture.actorUserId }],
        },
        requires_unstarted_schedules: true,
      })
    ).resolves.toBe('not_allowed');

    const root = await env.DB.prepare(
      `SELECT push_title, importance FROM notifications
       WHERE notification_id = ?`
    )
      .bind(created.notification_id)
      .first<{ push_title: string; importance: string }>();
    expect(root).toEqual({ push_title: 'Push title', importance: 'low' });

    const schedules = await env.DB.prepare(
      `SELECT notification_schedule_id, importance, send_at, started_at
       FROM notification_schedules WHERE notification_id = ?
       ORDER BY notification_schedule_id`
    )
      .bind(created.notification_id)
      .all<{
        notification_schedule_id: number;
        importance: number;
        send_at: string;
        started_at: string | null;
      }>();
    expect(schedules.results).toEqual([
      {
        notification_schedule_id: created.notification_schedule_id,
        importance: 1,
        send_at: '2026-09-24T10:00:00.000Z',
        started_at: null,
      },
      {
        notification_schedule_id: secondSchedule.notification_schedule_id,
        importance: 1,
        send_at: '2026-09-26T10:00:00.000Z',
        started_at: secondScheduleStartedAt,
      },
    ]);

    const audiences = await env.DB.prepare(
      `SELECT notification_schedule_id, audience_type, target_id
       FROM notification_audiences
       WHERE notification_schedule_id IN (?, ?)
       ORDER BY notification_schedule_id, audience_type`
    )
      .bind(
        created.notification_schedule_id,
        secondSchedule.notification_schedule_id
      )
      .all<{
        notification_schedule_id: number;
        audience_type: string;
        target_id: number | null;
      }>();
    expect(audiences.results).toEqual([
      {
        notification_schedule_id: created.notification_schedule_id,
        audience_type: 'all',
        target_id: null,
      },
      {
        notification_schedule_id: secondSchedule.notification_schedule_id,
        audience_type: 'class_room',
        target_id: fixture.classRoomId,
      },
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
});
