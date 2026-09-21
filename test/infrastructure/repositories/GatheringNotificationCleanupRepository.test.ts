import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGatheringNotificationCleanupService } from '../../../src/application/services/GatheringNotificationCleanupService';
import { createNotificationStopService } from '../../../src/application/services/NotificationStopService';
import { createEventGatheringSettingsService } from '../../../src/application/services/EventGatheringSettingsService';
import { createEventRepository } from '../../../src/infrastructure/repositories/EventRepository';
import { createEventGatheringSettingsRepository } from '../../../src/infrastructure/repositories/EventGatheringSettingsRepository';
import { createGatheringNotificationCleanupRepository } from '../../../src/infrastructure/repositories/GatheringNotificationCleanupRepository';
import { createGatheringSpotRepository } from '../../../src/infrastructure/repositories/GatheringSpotRepository';
import { createNotificationPushDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationPushDeliveryRepository';
import { createNotificationStopRepository } from '../../../src/infrastructure/repositories/NotificationStopRepository';

async function createGathering(): Promise<{
  eventId: number;
  gatheringId: number;
  spotId: number;
}> {
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('cleanup対象', '体育館', '0900', '1000') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('cleanup場所') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round) VALUES (?, ?, ?, ?) RETURNING gathering_id'
  )
    .bind(event!.event_id, spot!.gathering_spot_id, '10:00', 1)
    .first<{ gathering_id: number }>();
  return {
    eventId: event!.event_id,
    gatheringId: gathering!.gathering_id,
    spotId: spot!.gathering_spot_id,
  };
}

async function createNotification(
  gatheringId: number,
  title: string
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body, source_type, source_id, source_hash) VALUES ('gathering_reminder', ?, '本文', 'gathering', ?, ?) RETURNING notification_id"
  )
    .bind(title, gatheringId, 'hash-' + title)
    .first<{ notification_id: number }>();
  return row!.notification_id;
}

async function createSchedule(
  notificationId: number,
  status: string,
  startedAt: string | null
): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO notification_schedules (notification_id, send_at, send_status, started_at, recipients_resolved_at) VALUES (?, ?, ?, ?, ?) RETURNING notification_schedule_id'
  )
    .bind(
      notificationId,
      '2026-09-21T09:00:00.000Z',
      status,
      startedAt,
      startedAt
    )
    .first<{ notification_schedule_id: number }>();
  return row!.notification_schedule_id;
}

describe('GatheringNotificationCleanupRepository', () => {
  const eventRepository = createEventRepository(env.DB);
  const gatheringSpotRepository = createGatheringSpotRepository(env.DB);
  const eventGatheringSettingsRepository =
    createEventGatheringSettingsRepository(env.DB);
  const cleanupRepository = createGatheringNotificationCleanupRepository(
    env.DB
  );
  const stopService = createNotificationStopService({
    repository: createNotificationStopRepository(env.DB),
  });
  const pushRepository = createNotificationPushDeliveryRepository(env.DB);
  const cleanupService = createGatheringNotificationCleanupService({
    repository: cleanupRepository,
    notificationStopService: stopService,
  });
  const settingsService = createEventGatheringSettingsService(
    eventRepository,
    gatheringSpotRepository,
    eventGatheringSettingsRepository,
    cleanupService
  );

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
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('未開始Scheduleを削除し、開始済み履歴と配信済みDeliveryを保持する', async () => {
    const gathering = await createGathering();
    const unstartedNotification = await createNotification(
      gathering.gatheringId,
      '未開始'
    );
    const unstartedSchedule = await createSchedule(
      unstartedNotification,
      'scheduled',
      null
    );
    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type) VALUES (?, 'all')"
    )
      .bind(unstartedSchedule)
      .run();

    const completedNotification = await createNotification(
      gathering.gatheringId,
      '完了済み'
    );
    const completedSchedule = await createSchedule(
      completedNotification,
      'completed',
      '2026-09-21T08:59:00.000Z'
    );
    const futureSchedule = await createSchedule(
      completedNotification,
      'scheduled',
      null
    );
    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type) VALUES (?, 'all')"
    )
      .bind(futureSchedule)
      .run();

    await settingsService.saveEventGatheringSettings({
      event_id: gathering.eventId,
      rounds: [],
    });

    await expect(
      env.DB.prepare(
        'SELECT gathering_id FROM gatherings WHERE gathering_id = ?'
      )
        .bind(gathering.gatheringId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT notification_id FROM notifications WHERE notification_id = ?'
      )
        .bind(unstartedNotification)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT notification_schedule_id FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(unstartedSchedule)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT n.notification_id, s.send_status FROM notifications n INNER JOIN notification_schedules s ON s.notification_id = n.notification_id WHERE s.notification_schedule_id = ?'
      )
        .bind(completedSchedule)
        .first()
    ).resolves.toEqual({
      notification_id: completedNotification,
      send_status: 'completed',
    });
    await expect(
      env.DB.prepare(
        'SELECT notification_schedule_id FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(futureSchedule)
        .first()
    ).resolves.toBeNull();
  });

  it('sending Scheduleをsource_deletedで停止し、Recipientとsent Deliveryを保持する', async () => {
    const gathering = await createGathering();
    const notificationId = await createNotification(
      gathering.gatheringId,
      '配信中'
    );
    const scheduleId = await createSchedule(
      notificationId,
      'sending',
      '2026-09-21T08:59:00.000Z'
    );
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('配信履歴利用者') RETURNING user_id"
    ).first<{ user_id: number }>();
    const token = await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'cleanup-token') RETURNING firebase_token_id"
    )
      .bind(user!.user_id)
      .first<{ firebase_token_id: number }>();
    const recipient = await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
    )
      .bind(scheduleId, user!.user_id)
      .first<{ notification_recipient_id: number }>();
    const delivery = await env.DB.prepare(
      "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, first_attempt_at, last_attempt_at) VALUES (?, ?, 1, 'sending', '2026-09-21T09:00:00.000Z', '2026-09-21T09:00:00.000Z') RETURNING notification_push_delivery_id"
    )
      .bind(recipient!.notification_recipient_id, token!.firebase_token_id)
      .first<{ notification_push_delivery_id: number }>();

    await settingsService.saveEventGatheringSettings({
      event_id: gathering.eventId,
      rounds: [],
    });

    await expect(
      pushRepository.markDeliverySent(
        delivery!.notification_push_delivery_id,
        'cleanup-message',
        '2026-09-21T09:01:00.000Z'
      )
    ).resolves.toBe(true);
    await expect(
      env.DB.prepare(
        'SELECT send_status, stopped_by_user_id, reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.toEqual({
      send_status: 'stopped',
      stopped_by_user_id: null,
      reason: 'source_deleted',
    });
    await expect(
      env.DB.prepare(
        'SELECT COUNT(*) AS count FROM notification_recipients WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first<{ count: number }>()
    ).resolves.toEqual({ count: 1 });
    await expect(
      env.DB.prepare(
        'SELECT status, fcm_message_id FROM notification_push_deliveries WHERE notification_recipient_id = ?'
      )
        .bind(recipient!.notification_recipient_id)
        .first()
    ).resolves.toEqual({
      status: 'sent',
      fcm_message_id: 'cleanup-message',
    });
  });
});
