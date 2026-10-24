import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTOMATIC_SYNC_PENDING_REASON,
  type AutomaticNotificationCreationCommand,
} from '../../../src/domain/entities/NotificationCreation';
import { createNotificationCreationRepository } from '../../../src/infrastructure/repositories/NotificationCreationRepository';
import { createGatheringNotificationGeneratorRepository } from '../../../src/infrastructure/repositories/GatheringNotificationGeneratorRepository';
import { createGatheringNotificationGeneratorService } from '../../../src/application/services/GatheringNotificationGeneratorService';
import { createFixture } from './adminNotificationRepositoryFixtures';

const repository = createNotificationCreationRepository(env.DB);

describe('NotificationCreationRepository', () => {
  beforeEach(async () => {
    const teamsTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'teams'"
    ).first<{ name: string }>();
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
      ...(teamsTable
        ? [
            env.DB.prepare('DELETE FROM team_scores'),
            env.DB.prepare('DELETE FROM teams'),
          ]
        : []),
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
      `SELECT scheduled_by_user_id, notification_id, send_status, send_at
       FROM notification_schedules WHERE notification_schedule_id = ?`
    )
      .bind(outcome.result.notification_schedule_id)
      .first<Record<string, unknown>>();
    expect(schedule).toEqual({
      scheduled_by_user_id: null,
      notification_id: outcome.result.notification_id,
      send_status: 'scheduled',
      send_at: '2026-10-04T01:00:00.000Z',
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

  it('異なる状態の並行初回生成も1 Notificationと1 Scheduleへ収束する', async () => {
    const fixture = await createFixture();

    const outcomes = await Promise.all([
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-a',
          '10:45',
          '2026-11-07T01:30:00.000Z'
        )
      ),
      repository.createOrUpdateAutomatic(
        buildAutomaticCommand(
          fixture.gatheringId,
          'hash-b',
          '11:00',
          '2026-11-07T01:45:00.000Z'
        )
      ),
    ]);

    expect(outcomes.map(outcome => outcome.status).sort()).toEqual([
      'created',
      'updated',
    ]);

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notifications
          WHERE source_type = 'gathering' AND source_id = ?) AS notifications,
         (SELECT COUNT(*) FROM notification_schedules s
          JOIN notifications n USING (notification_id)
          WHERE n.source_type = 'gathering' AND n.source_id = ?) AS schedules`
    )
      .bind(fixture.gatheringId, fixture.gatheringId)
      .first<{ notifications: number; schedules: number }>();
    expect(counts).toEqual({ notifications: 1, schedules: 1 });

    const current = await env.DB.prepare(
      `SELECT n.source_hash, n.push_body, s.send_at
       FROM notifications n
       JOIN notification_schedules s USING (notification_id)
       WHERE n.source_type = 'gathering' AND n.source_id = ?`
    )
      .bind(fixture.gatheringId)
      .first<{
        source_hash: string;
        push_body: string;
        send_at: string;
      }>();
    expect([
      {
        source_hash: 'hash-a',
        push_body: '集合時間は10:45です。',
        send_at: '2026-11-07T01:30:00.000Z',
      },
      {
        source_hash: 'hash-b',
        push_body: '集合時間は11:00です。',
        send_at: '2026-11-07T01:45:00.000Z',
      },
    ]).toContainEqual(current);
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

  it('定期再同期でEVENT_DATE変更を既存automatic Scheduleへ反映する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      'UPDATE gatherings SET gathering_time = ? WHERE gathering_id = ?'
    )
      .bind('10:45', fixture.gatheringId)
      .run();

    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(
        fixture.gatheringId,
        'same-hash',
        '10:45',
        '2026-11-07T01:30:00.000Z'
      )
    );
    if (first.status !== 'created') {
      throw new Error('初回通知が作成されませんでした');
    }

    const service = createGatheringNotificationGeneratorService(
      createGatheringNotificationGeneratorRepository(env.DB),
      repository,
      '2026-11-08',
      () => '2026-10-04T01:00:00.000Z'
    );

    await expect(service.reconcileAll()).resolves.toEqual({
      processed_count: 1,
      failed_gathering_ids: [],
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

  it('actor匿名化済みの手動再送をautomatic Scheduleと誤認しない', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    const manual = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         scheduled_by_user_id, notification_id, send_status, send_at,
         created_at, updated_at
       ) VALUES (?, ?, 'scheduled', ?, ?, ?)
       RETURNING notification_schedule_id`
    )
      .bind(
        fixture.actorUserId,
        first.result.notification_id,
        '2026-11-07T02:00:00.000Z',
        '2026-10-04T02:00:00.000Z',
        '2026-10-04T02:00:00.000Z'
      )
      .first<{ notification_schedule_id: number }>();
    if (!manual) throw new Error('手動再送Scheduleが作成されませんでした');

    await env.DB.prepare(
      `UPDATE notification_schedules
       SET scheduled_by_user_id = NULL
       WHERE notification_schedule_id = ?`
    )
      .bind(manual.notification_schedule_id)
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

    const schedules = await env.DB.prepare(
      `SELECT notification_schedule_id, send_at
       FROM notification_schedules
       WHERE notification_id = ?
       ORDER BY notification_schedule_id`
    )
      .bind(first.result.notification_id)
      .all<{ notification_schedule_id: number; send_at: string }>();

    expect(schedules.results).toEqual([
      {
        notification_schedule_id: first.result.notification_schedule_id,
        send_at: '2026-11-07T01:45:00.000Z',
      },
      {
        notification_schedule_id: manual.notification_schedule_id,
        send_at: '2026-11-07T02:00:00.000Z',
      },
    ]);
  });

  it('元automatic Scheduleを明示取消した後は自動生成を復活させない', async () => {
    const fixture = await createFixture();
    const first = await repository.createOrUpdateAutomatic(
      buildAutomaticCommand(fixture.gatheringId, 'hash-10-45')
    );
    if (first.status !== 'created')
      throw new Error('初回通知が作成されませんでした');

    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(first.result.notification_schedule_id)
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

    const notification = await env.DB.prepare(
      `SELECT push_body, source_hash FROM notifications
       WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<Record<string, unknown>>();
    expect(notification).toEqual({
      push_body: '集合時間は10:45です。',
      source_hash: 'hash-10-45',
    });

    const scheduleCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notification_schedules
       WHERE notification_id = ?`
    )
      .bind(first.result.notification_id)
      .first<{ count: number }>();
    expect(scheduleCount?.count).toBe(0);
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

  it.each([9, 10, 11])(
    '毎時再同期は送信まで%s分の通知に10分締切を適用する',
    async minutes => {
      const fixture = await createFixture();
      const now = '2026-10-04T00:00:00.000Z';
      const previousSend = new Date(
        Date.parse(now) + minutes * 60_000
      ).toISOString();
      const command = {
        ...buildAutomaticCommand(
          fixture.gatheringId,
          'original',
          '10:45',
          previousSend
        ),
        now,
      };
      const original = await repository.createOrUpdateAutomatic(command);
      if (original.status !== 'created') throw new Error('通知未作成');
      const nextSend = '2026-10-05T01:00:00.000Z';
      const result = await repository.createOrUpdateAutomatic({
        ...command,
        source: { ...command.source, hash: 'new-date' },
        send_at: nextSend,
        sync_cutoff: '2026-10-04T00:10:00.000Z',
      });
      expect(result.status).toBe(minutes < 10 ? 'already_exists' : 'updated');
      const row = await env.DB.prepare(
        'SELECT s.send_at, n.source_hash FROM notification_schedules s JOIN notifications n USING (notification_id) WHERE s.notification_schedule_id = ?'
      )
        .bind(original.result.notification_schedule_id)
        .first();
      expect(row).toMatchObject({
        send_at: minutes < 10 ? previousSend : nextSend,
        source_hash: minutes < 10 ? 'original' : 'new-date',
      });
    }
  );

  it('再同期に失敗した通知は次のCronでも送信開始せず、復旧後に同じ通知を再同期する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      "UPDATE gatherings SET gathering_time = '10:45' WHERE gathering_id = ?"
    )
      .bind(fixture.gatheringId)
      .run();
    const gatheringRepository = createGatheringNotificationGeneratorRepository(
      env.DB
    );
    const now = () => '2026-10-04T00:00:00.000Z';
    const original = createGatheringNotificationGeneratorService(
      gatheringRepository,
      repository,
      '2026-11-07',
      now
    );
    await original.generate(fixture.gatheringId);
    await gatheringRepository.holdAutomaticSchedules(fixture.gatheringId);
    await env.DB.prepare(
      "UPDATE gatherings SET gathering_time = '11:00' WHERE gathering_id = ?"
    )
      .bind(fixture.gatheringId)
      .run();
    const failed = createGatheringNotificationGeneratorService(
      gatheringRepository,
      {
        ...repository,
        createOrUpdateAutomatic: async () => {
          throw new Error('再同期失敗');
        },
      },
      '2026-11-08',
      now
    );
    expect((await failed.reconcileAll()).failed_gathering_ids).toEqual([
      fixture.gatheringId,
    ]);
    const row = await env.DB.prepare(
      "SELECT s.notification_schedule_id, s.failed_reason FROM notification_schedules s JOIN notifications n USING (notification_id) WHERE n.source_type = 'gathering' AND n.source_id = ?"
    )
      .bind(fixture.gatheringId)
      .first<{ notification_schedule_id: number; failed_reason: string }>();
    expect(row!.failed_reason).toBe('AUTOMATIC_SYNC_PENDING');
    const resolver = createNotificationAudienceResolverRepository(env.DB);
    expect(
      await resolver.findDueCandidates('2026-11-10T00:00:00.000Z', 100)
    ).toEqual([]);
    expect(
      await resolver.claimScheduled(
        row!.notification_schedule_id,
        '2026-11-10T00:00:00.000Z'
      )
    ).toBe(false);
    await gatheringRepository.clearAutomaticScheduleHold(
      fixture.gatheringId,
      '10:45'
    );
    const stillHeld = await env.DB.prepare(
      'SELECT failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(row!.notification_schedule_id)
      .first<{ failed_reason: string | null }>();
    expect(stillHeld?.failed_reason).toBe(AUTOMATIC_SYNC_PENDING_REASON);

    const recovered = createGatheringNotificationGeneratorService(
      gatheringRepository,
      repository,
      '2026-11-08',
      now
    );
    expect((await recovered.reconcileAll()).failed_gathering_ids).toEqual([]);
    const syncedSchedule = await env.DB.prepare(
      'SELECT send_at, failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(row!.notification_schedule_id)
      .first<{ send_at: string; failed_reason: string | null }>();
    expect(syncedSchedule).toEqual({
      send_at: '2026-11-08T01:45:00.000Z',
      failed_reason: null,
    });
    expect(
      await resolver.findDueCandidates('2026-11-10T00:00:00.000Z', 100)
    ).toEqual([
      expect.objectContaining({
        notification_schedule_id: row!.notification_schedule_id,
      }),
    ]);
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
  };
}
