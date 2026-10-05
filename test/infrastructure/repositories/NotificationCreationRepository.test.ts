import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AutomaticNotificationCreationCommand } from '../../../src/domain/entities/NotificationCreation';
import { createNotificationCreationRepository } from '../../../src/infrastructure/repositories/NotificationCreationRepository';
import { createFixture } from './adminNotificationRepositoryFixtures';

const repository = createNotificationCreationRepository(env.DB);

describe('NotificationCreationRepository', () => {
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

  it('automatic通知をsource/hash/Audience付きで作り、Recipientは作らない', async () => {
    const fixture = await createFixture();
    const command = buildAutomaticCommand(fixture.gatheringId, 'hash-10-45');

    const outcome = await repository.create(command);
    expect(outcome.status).toBe('created');
    if (outcome.status !== 'created')
      throw new Error('通知が作成されませんでした');

    const root = await env.DB.prepare(
      `SELECT created_by_user_id, notification_type, importance,
              source_type, source_id, source_hash
       FROM notifications WHERE notification_id = ?`
    )
      .bind(outcome.result.notification_id)
      .first<Record<string, unknown>>();
    expect(root).toEqual({
      created_by_user_id: null,
      notification_type: 'notification_general',
      importance: 'normal',
      source_type: 'gathering',
      source_id: fixture.gatheringId,
      source_hash: 'hash-10-45',
    });

    const schedule = await env.DB.prepare(
      `SELECT scheduled_by_user_id, notification_id, send_status, send_at,
              created_user_id, event_id
       FROM notification_schedules WHERE notification_schedule_id = ?`
    )
      .bind(outcome.result.notification_schedule_id)
      .first<Record<string, unknown>>();
    expect(schedule).toEqual({
      scheduled_by_user_id: null,
      notification_id: outcome.result.notification_id,
      send_status: 'scheduled',
      send_at: '2026-10-04T01:00:00.000Z',
      created_user_id: null,
      event_id: null,
    });

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notification_audiences
           WHERE notification_schedule_id = ?) AS audiences,
         (SELECT COUNT(*) FROM notification_recipients
           WHERE notification_schedule_id = ?) AS recipients,
         (SELECT COUNT(*) FROM notification_push_deliveries d
           JOIN notification_recipients r USING (notification_recipient_id)
           WHERE r.notification_schedule_id = ?) AS deliveries`
    )
      .bind(
        outcome.result.notification_schedule_id,
        outcome.result.notification_schedule_id,
        outcome.result.notification_schedule_id
      )
      .first<{ audiences: number; recipients: number; deliveries: number }>();
    expect(counts).toEqual({ audiences: 1, recipients: 0, deliveries: 0 });
  });

  it('同一source/hashの並行作成をUNIQUE競合からno-opへ収束する', async () => {
    const fixture = await createFixture();
    const command = buildAutomaticCommand(fixture.gatheringId, 'same-hash');

    const outcomes = await Promise.all([
      repository.create(command),
      repository.create(command),
    ]);

    expect(outcomes.map(outcome => outcome.status).sort()).toEqual([
      'already_exists',
      'created',
    ]);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE source_type = 'gathering' AND source_id = ?
         AND notification_type = 'notification_general' AND source_hash = ?`
    )
      .bind(fixture.gatheringId, 'same-hash')
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('同じautomatic commandの再実行を既生成として返す', async () => {
    const fixture = await createFixture();
    const command = buildAutomaticCommand(fixture.gatheringId, 'same-hash');

    await expect(
      repository.createOrUpdateAutomatic(command)
    ).resolves.toMatchObject({
      status: 'created',
    });
    await expect(repository.createOrUpdateAutomatic(command)).resolves.toEqual({
      status: 'already_exists',
    });
  });

  it('未開始のautomatic通知は同じIDのまま内容と送信時刻・Hashを更新する', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    const updated = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(
        fixture.gatheringId,
        'hash-11-00',
        '11:00',
        '2026-11-07T01:45:00.000Z'
      )
    );
    expect(updated).toEqual({
      status: 'updated',
      result: first.result,
    });
    const content = await env.DB.prepare(
      `SELECT push_body, body, source_hash FROM notifications WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(content).toEqual({
      push_body: '集合時間は11:00です。',
      body: '集合時間は11:00です。',
      source_hash: 'hash-11-00',
    });
    const schedule = await env.DB.prepare(
      `SELECT notification_schedule_id, send_at FROM notification_schedules
       WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(schedule).toEqual({
      notification_schedule_id: first.result.notification_schedule_id,
      send_at: '2026-11-07T01:45:00.000Z',
    });
    const audienceCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notification_audiences WHERE notification_schedule_id = ?`
    )
      .bind(first.result.notification_schedule_id)
      .first<{ count: number }>();
    expect(audienceCount?.count).toBe(1);
  });

  it('同じHashでもsend_atが変われば未開始Scheduleを更新する', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(
        fixture.gatheringId,
        'hash-10-45',
        '10:45',
        '2026-11-07T01:30:00.000Z'
      )
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    const updated = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(
        fixture.gatheringId,
        'hash-10-45',
        '10:45',
        '2026-11-08T01:30:00.000Z'
      )
    );

    expect(updated).toEqual({
      status: 'updated',
      result: first.result,
    });
    const schedule = await env.DB.prepare(
      `SELECT send_at FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(first.result.notification_schedule_id)
      .first<{ send_at: string }>();
    expect(schedule?.send_at).toBe('2026-11-08T01:30:00.000Z');
  });

  it('未開始のA→B→Aは同じNotificationとScheduleを現在値へ戻す', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(
        fixture.gatheringId,
        'hash-a',
        '10:45',
        '2026-11-07T01:30:00.000Z'
      )
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    await expect(
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-b',
          '11:00',
          '2026-11-07T01:45:00.000Z'
        )
      )
    ).resolves.toEqual({
      status: 'updated',
      result: first.result,
    });

    await expect(
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-a',
          '10:45',
          '2026-11-07T01:30:00.000Z'
        )
      )
    ).resolves.toEqual({
      status: 'updated',
      result: first.result,
    });

    const state = await env.DB.prepare(
      `SELECT n.push_body, n.source_hash, s.notification_schedule_id, s.send_at
       FROM notifications n
       INNER JOIN notification_schedules s
         ON s.notification_id = n.notification_id
       WHERE n.notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(state).toEqual({
      push_body: '集合時間は10:45です。',
      source_hash: 'hash-a',
      notification_schedule_id: first.result.notification_schedule_id,
      send_at: '2026-11-07T01:30:00.000Z',
    });

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications
          WHERE source_type = 'gathering' AND source_id = ?) AS notifications,
         (SELECT COUNT(*) FROM notification_schedules
          WHERE notification_id = ?) AS schedules`
    )
      .bind(fixture.gatheringId, first.result.notification_id)
      .first<{ notifications: number; schedules: number }>();
    expect(counts).toEqual({ notifications: 1, schedules: 1 });
  });

  it('Schedule開始後はGathering変更へ追従せず新規通知も作らない', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    await env.DB.prepare(
      `UPDATE notification_schedules
       SET send_status = 'resolving', started_at = ?
       WHERE notification_schedule_id = ?`
    )
      .bind('2026-11-07T01:30:00.000Z', first.result.notification_schedule_id)
      .run();

    await expect(
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-11-00',
          '11:00',
          '2026-11-07T01:45:00.000Z'
        )
      )
    ).resolves.toEqual({ status: 'already_exists' });

    const state = await env.DB.prepare(
      `SELECT n.push_body, n.source_hash, s.send_status, s.started_at, s.send_at
       FROM notifications n
       INNER JOIN notification_schedules s
         ON s.notification_id = n.notification_id
       WHERE n.notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(state).toEqual({
      push_body: '集合時間は10:45です。',
      source_hash: 'hash-10-45',
      send_status: 'resolving',
      started_at: '2026-11-07T01:30:00.000Z',
      send_at: '2026-10-04T01:00:00.000Z',
    });

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE source_type = 'gathering' AND source_id = ?`
    )
      .bind(fixture.gatheringId)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('未開始の手動再送があってもautomatic Scheduleだけ送信時刻を追従する', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         scheduled_by_user_id, notification_id, send_status, send_at, created_at, updated_at
       ) VALUES (?, ?, 'scheduled', ?, ?, ?)`
    )
      .bind(
        fixture.actorUserId,
        first.result.notification_id,
        '2026-11-07T02:00:00.000Z',
        '2026-10-04T01:00:00.000Z',
        '2026-10-04T01:00:00.000Z'
      )
      .run();

    await expect(
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-11-00',
          '11:00',
          '2026-11-07T01:45:00.000Z'
        )
      )
    ).resolves.toEqual({
      status: 'updated',
      result: first.result,
    });

    const content = await env.DB.prepare(
      `SELECT push_body, source_hash FROM notifications
       WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(content).toEqual({
      push_body: '集合時間は11:00です。',
      source_hash: 'hash-11-00',
    });

    const schedules = await env.DB.prepare(
      `SELECT notification_schedule_id, send_at, scheduled_by_user_id
       FROM notification_schedules WHERE notification_id = ?
       ORDER BY notification_schedule_id`
    )
      .bind(first.result.notification_id)
      .all<Record<string, unknown>>();
    expect(schedules.results).toHaveLength(2);
    expect(schedules.results[0]).toMatchObject({
      notification_schedule_id: first.result.notification_schedule_id,
      send_at: '2026-11-07T01:45:00.000Z',
      scheduled_by_user_id: null,
    });
    expect(schedules.results[1]).toMatchObject({
      send_at: '2026-11-07T02:00:00.000Z',
      scheduled_by_user_id: fixture.actorUserId,
    });
  });

  it('手動再送Scheduleが開始済みならautomatic追従を止める', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         scheduled_by_user_id, notification_id, send_status, send_at,
         started_at, created_at, updated_at
       ) VALUES (?, ?, 'resolving', ?, ?, ?, ?)`
    )
      .bind(
        fixture.actorUserId,
        first.result.notification_id,
        '2026-11-07T02:00:00.000Z',
        '2026-11-07T02:00:00.000Z',
        '2026-10-04T01:00:00.000Z',
        '2026-10-04T01:00:00.000Z'
      )
      .run();

    await expect(
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-11-00',
          '11:00',
          '2026-11-07T01:45:00.000Z'
        )
      )
    ).resolves.toEqual({ status: 'already_exists' });

    const state = await env.DB.prepare(
      `SELECT push_body, source_hash FROM notifications
       WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(state).toEqual({
      push_body: '集合時間は10:45です。',
      source_hash: 'hash-10-45',
    });
  });
});

function buildAutomaticCommand(
  gatheringId: number,
  sourceHash: string,
  gatheringTime = '10:45',
  sendAt = '2026-10-04T01:00:00.000Z'
): AutomaticNotificationCreationCommand {
  return {
    created_by_user_id: null,
    scheduled_by_user_id: null,
    push_title: '集合時間のお知らせ',
    push_body: `集合時間は${gatheringTime}です。`,
    detail_title: '集合時間のお知らせ',
    detail_body: `集合時間は${gatheringTime}です。`,
    importance: 'normal',
    send_at: sendAt,
    audiences: [{ type: 'gathering', target_id: gatheringId }],
    source: { type: 'gathering', id: gatheringId, hash: sourceHash },
    now: '2026-10-04T01:00:00.000Z',
    legacy_schedule: null,
  };
}
