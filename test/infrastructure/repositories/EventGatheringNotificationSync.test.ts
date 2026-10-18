import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../../src/domain/entities/NotificationCreation';
import type { INotificationCreationRepository } from '../../../src/domain/interfaces/repositories/INotificationCreationRepository';
import { createGatheringNotificationGeneratorService } from '../../../src/application/services/GatheringNotificationGeneratorService';
import { createNotificationCreationRepository } from '../../../src/infrastructure/repositories/NotificationCreationRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createEventGatheringSettingsRepository } from '../../../src/infrastructure/repositories/EventGatheringSettingsRepository';
import { createGatheringNotificationGeneratorRepository } from '../../../src/infrastructure/repositories/GatheringNotificationGeneratorRepository';

describe('EventGatheringSettingsRepository notification sync transaction', () => {
  let eventId: number | undefined;
  let spotId: number | undefined;
  let gatheringId: number | undefined;
  let notificationId: number | undefined;
  let scheduleId: number | undefined;

  async function createScheduleFixture(name: string, sourceHash: string) {
    const createdAt = '2026-11-07T01:00:00.000Z';
    eventId = (await env.DB.prepare(
      'INSERT INTO events (event_name, start_time, end_time) VALUES (?, ?, ?) RETURNING event_id'
    )
      .bind(name, '0900', '1000')
      .first<{ event_id: number }>())!.event_id;
    spotId = (await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`${name}場所`)
      .first<{ gathering_spot_id: number }>())!.gathering_spot_id;
    gatheringId = (await env.DB.prepare(
      "INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, 1, '10:45') RETURNING gathering_id"
    )
      .bind(eventId, spotId)
      .first<{ gathering_id: number }>())!.gathering_id;
    notificationId = (await env.DB.prepare(
      `INSERT INTO notifications (
           notification_type, push_title, push_body, title, body,
           source_type, source_id, source_hash, created_at
         ) VALUES ('notification_general', '集合時間', '10:45', '集合時間', '10:45', 'gathering', ?, ?, ?)
         RETURNING notification_id`
    )
      .bind(gatheringId, sourceHash, createdAt)
      .first<{ notification_id: number }>())!.notification_id;
    scheduleId = (await env.DB.prepare(
      `INSERT INTO notification_schedules (
           notification_id, send_status, send_at, created_at
         ) VALUES (?, 'scheduled', '2026-11-07T01:30:00.000Z', ?)
         RETURNING notification_schedule_id`
    )
      .bind(notificationId, createdAt)
      .first<{ notification_schedule_id: number }>())!.notification_schedule_id;

    return { eventId, gatheringId, scheduleId, spotId };
  }

  afterEach(async () => {
    if (scheduleId !== undefined) {
      await env.DB.prepare(
        'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .run();
    }
    if (notificationId !== undefined) {
      await env.DB.prepare(
        'DELETE FROM notifications WHERE notification_id = ?'
      )
        .bind(notificationId)
        .run();
    }
    if (gatheringId !== undefined) {
      await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
        .bind(gatheringId)
        .run();
    }
    if (eventId !== undefined) {
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(eventId)
        .run();
    }
    if (spotId !== undefined) {
      await env.DB.prepare(
        'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
      )
        .bind(spotId)
        .run();
    }
    eventId = undefined;
    spotId = undefined;
    gatheringId = undefined;
    notificationId = undefined;
    scheduleId = undefined;
  });

  it('送信30分前の旧Scheduleを同期失敗中はCronから除外し、復旧同期後に解除する', async () => {
    const fixture = await createScheduleFixture(
      '通知同期保留テスト',
      'sync-test'
    );
    const repository = createEventGatheringSettingsRepository(env.DB);
    await expect(
      repository.apply(
        {
          event_id: fixture.eventId,
          creates: [],
          updates: [
            {
              gathering_id: fixture.gatheringId,
              round: 1,
              gathering_time: '11:00',
              gathering_spot_id: fixture.spotId,
            },
          ],
          delete_ids: [],
        },
        { holdNotificationSyncGatheringIds: [fixture.gatheringId] }
      )
    ).resolves.toBeUndefined();

    const persisted = await env.DB.prepare(
      `SELECT g.gathering_time, s.failed_reason
       FROM gatherings g
       JOIN notifications n ON n.source_id = g.gathering_id AND n.source_type = 'gathering'
       JOIN notification_schedules s ON s.notification_id = n.notification_id
       WHERE g.gathering_id = ? AND s.notification_schedule_id = ?`
    )
      .bind(fixture.gatheringId, fixture.scheduleId)
      .first<{ gathering_time: string; failed_reason: string | null }>();
    expect(persisted).toEqual({
      gathering_time: '11:00',
      failed_reason: AUTOMATIC_SYNC_PENDING_REASON,
    });

    const generatorRepository = createGatheringNotificationGeneratorRepository(
      env.DB
    );
    const failedNotificationRepository = {
      createOrUpdateAutomatic: vi
        .fn()
        .mockRejectedValue(new Error('notification generation failed')),
    } as unknown as INotificationCreationRepository;
    const failedGenerator = createGatheringNotificationGeneratorService(
      generatorRepository,
      failedNotificationRepository,
      '2026-11-07',
      () => '2026-11-07T01:00:00.000Z'
    );
    await expect(failedGenerator.generate(fixture.gatheringId)).rejects.toThrow(
      'notification generation failed'
    );
    const reconciliation = await failedGenerator.reconcileAll();
    expect(reconciliation.failed_gathering_ids).toEqual([fixture.gatheringId]);

    const resolver = createNotificationAudienceResolverRepository(env.DB);
    expect(
      await resolver.findDueCandidates('2026-11-07T01:30:00.000Z', 100)
    ).toEqual([]);

    await generatorRepository.clearAutomaticScheduleHold(
      fixture.gatheringId,
      '10:45'
    );
    const stillHeld = await env.DB.prepare(
      'SELECT failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(fixture.scheduleId)
      .first<{ failed_reason: string | null }>();
    expect(stillHeld?.failed_reason).toBe(AUTOMATIC_SYNC_PENDING_REASON);

    const recoveredGenerator = createGatheringNotificationGeneratorService(
      generatorRepository,
      createNotificationCreationRepository(env.DB),
      '2026-11-07',
      () => '2026-11-07T01:00:00.000Z'
    );
    expect(
      (await recoveredGenerator.reconcileAll()).failed_gathering_ids
    ).toEqual([]);
    const released = await env.DB.prepare(
      'SELECT send_at, failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(fixture.scheduleId)
      .first<{ send_at: string; failed_reason: string | null }>();
    expect(released).toEqual({
      send_at: '2026-11-07T01:45:00.000Z',
      failed_reason: null,
    });
    expect(
      await resolver.findDueCandidates('2026-11-07T01:45:00.000Z', 100)
    ).toEqual([
      expect.objectContaining({
        notification_schedule_id: fixture.scheduleId,
      }),
    ]);
  });

  it('設定更新のbatchが失敗したら自動Scheduleの保留もrollbackする', async () => {
    const fixture = await createScheduleFixture(
      '通知同期rollbackテスト',
      'sync-rollback-test'
    );

    await expect(
      createEventGatheringSettingsRepository(env.DB).apply(
        {
          event_id: fixture.eventId,
          creates: [],
          updates: [
            {
              gathering_id: fixture.gatheringId,
              round: 1,
              gathering_time: '11:00',
              gathering_spot_id: 999999,
            },
          ],
          delete_ids: [],
        },
        { holdNotificationSyncGatheringIds: [fixture.gatheringId] }
      )
    ).rejects.toThrow();

    const unchanged = await env.DB.prepare(
      `SELECT g.gathering_time, s.failed_reason
       FROM gatherings g
       JOIN notifications n ON n.source_id = g.gathering_id AND n.source_type = 'gathering'
       JOIN notification_schedules s ON s.notification_id = n.notification_id
       WHERE g.gathering_id = ? AND s.notification_schedule_id = ?`
    )
      .bind(fixture.gatheringId, fixture.scheduleId)
      .first<{ gathering_time: string; failed_reason: string | null }>();
    expect(unchanged).toEqual({
      gathering_time: '10:45',
      failed_reason: null,
    });
  });
});
