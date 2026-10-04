import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NotificationCreationCommand } from '../../../src/domain/entities/NotificationCreation';
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

    await expect(repository.create(command)).resolves.toMatchObject({
      status: 'created',
    });
    await expect(repository.create(command)).resolves.toEqual({
      status: 'already_exists',
    });
  });
});

function buildAutomaticCommand(
  gatheringId: number,
  sourceHash: string
): NotificationCreationCommand {
  return {
    created_by_user_id: null,
    scheduled_by_user_id: null,
    push_title: '集合時間のお知らせ',
    push_body: '集合時間は10:45です。',
    detail_title: '集合時間のお知らせ',
    detail_body: '集合時間は10:45です。',
    importance: 'normal',
    send_at: '2026-10-04T01:00:00.000Z',
    audiences: [{ type: 'gathering', target_id: gatheringId }],
    source: { type: 'gathering', id: gatheringId, hash: sourceHash },
    now: '2026-10-04T01:00:00.000Z',
    legacy_schedule: null,
  };
}
