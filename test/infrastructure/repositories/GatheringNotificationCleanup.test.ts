import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEventGatheringSettingsRepository } from '../../../src/infrastructure/repositories/EventGatheringSettingsRepository';
import { createGatheringNotificationGeneratorRepository } from '../../../src/infrastructure/repositories/GatheringNotificationGeneratorRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationCreationRepository } from '../../../src/infrastructure/repositories/NotificationCreationRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { createGatheringNotificationGeneratorService } from '../../../src/application/services/GatheringNotificationGeneratorService';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';

const NOW = '2026-10-22T09:00:00.000Z';

type ScheduleStatus =
  'scheduled' | 'resolving' | 'sending' | 'completed' | 'failed' | 'stopped';

interface ScheduleOptions {
  status: ScheduleStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  recipientsResolvedAt?: string | null;
}

describe('GatheringNotificationCleanup', () => {
  const repository = createEventGatheringSettingsRepository(env.DB);

  beforeEach(clearNotificationFixtures);

  async function createGatheringFixture(): Promise<{
    eventId: number;
    gatheringId: number;
  }> {
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES ('cleanup対象', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('cleanup場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const gathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round) VALUES (?, ?, ?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id, '10:00', 1)
      .first<{ gathering_id: number }>();
    return { eventId: event!.event_id, gatheringId: gathering!.gathering_id };
  }

  async function createNotification(
    gatheringId: number,
    title: string
  ): Promise<number> {
    const row = await env.DB.prepare(
      `INSERT INTO notifications (
         push_title, push_body, notification_type, title, body,
         source_type, source_id, source_hash
       ) VALUES (?, ?, 'notification_general', ?, ?, 'gathering', ?, ?)
       RETURNING notification_id`
    )
      .bind(
        title,
        `${title}の本文`,
        title,
        `${title}の詳細`,
        gatheringId,
        `hash-${title}`
      )
      .first<{ notification_id: number }>();
    return row!.notification_id;
  }

  async function createSchedule(
    notificationId: number,
    options: ScheduleOptions
  ): Promise<number> {
    const row = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, send_status, send_at, started_at,
         recipients_resolved_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       RETURNING notification_schedule_id`
    )
      .bind(
        notificationId,
        options.status,
        NOW,
        options.startedAt ?? null,
        options.recipientsResolvedAt ?? null,
        options.completedAt ?? null
      )
      .first<{ notification_schedule_id: number }>();
    return row!.notification_schedule_id;
  }

  async function createAutomaticNotification(
    gatheringId: number,
    title: string,
    options: ScheduleOptions
  ): Promise<{ notificationId: number; scheduleId: number }> {
    const notificationId = await createNotification(gatheringId, title);
    const scheduleId = await createSchedule(notificationId, options);
    return { notificationId, scheduleId };
  }

  async function createAudience(scheduleId: number): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type) VALUES (?, 'all')"
    )
      .bind(scheduleId)
      .run();
  }

  async function createRecipient(scheduleId: number): Promise<number> {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('cleanup利用者') RETURNING user_id"
    ).first<{ user_id: number }>();
    const recipient = await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
    )
      .bind(scheduleId, user!.user_id)
      .first<{ notification_recipient_id: number }>();
    return recipient!.notification_recipient_id;
  }

  async function createDelivery(
    recipientId: number,
    status: string
  ): Promise<number> {
    const row = await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, platform, status
       ) VALUES (?, 1, ?) RETURNING notification_push_delivery_id`
    )
      .bind(recipientId, status)
      .first<{ notification_push_delivery_id: number }>();
    return row!.notification_push_delivery_id;
  }

  function applyDeletion(eventId: number, gatheringId: number) {
    return repository.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [],
        delete_ids: [gatheringId],
      },
      {
        notificationCleanup: {
          gathering_ids: [gatheringId],
          stop_policy: {
            stopped_by_user_id: null,
            reason: 'source_deleted',
            allowed_statuses: ['resolving', 'sending'],
            now: NOW,
          },
        },
      }
    );
  }

  it('未開始の自動通知とSchedule・Audienceを削除する', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { notificationId, scheduleId } = await createAutomaticNotification(
      gatheringId,
      '未開始',
      { status: 'scheduled' }
    );
    await createAudience(scheduleId);

    await applyDeletion(eventId, gatheringId);

    await expect(
      env.DB.prepare('SELECT 1 FROM gatherings WHERE gathering_id = ?')
        .bind(gatheringId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare('SELECT 1 FROM notifications WHERE notification_id = ?')
        .bind(notificationId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT 1 FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT 1 FROM notification_audiences WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.toBeNull();
    await expect(
      createNotificationAudienceResolverRepository(env.DB).claimScheduled(
        scheduleId,
        NOW
      )
    ).resolves.toBe(false);
  });

  it('配信中のScheduleをsource_deletedで停止し、送信待ちDeliveryだけ止める', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { notificationId, scheduleId } = await createAutomaticNotification(
      gatheringId,
      '配信中',
      {
        status: 'sending',
        startedAt: NOW,
        recipientsResolvedAt: NOW,
      }
    );
    const recipientId = await createRecipient(scheduleId);
    const pendingDeliveryId = await createDelivery(recipientId, 'pending');
    const sendingDeliveryId = await createDelivery(recipientId, 'sending');
    const sentDeliveryId = await createDelivery(recipientId, 'sent');

    await applyDeletion(eventId, gatheringId);

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
      env.DB.prepare('SELECT 1 FROM notifications WHERE notification_id = ?')
        .bind(notificationId)
        .first()
    ).resolves.not.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT status, next_retry_at FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(pendingDeliveryId)
        .first()
    ).resolves.toEqual({ status: 'stopped', next_retry_at: null });
    await expect(
      env.DB.prepare(
        'SELECT status FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(sendingDeliveryId)
        .first()
    ).resolves.toEqual({ status: 'sending' });
    await expect(
      env.DB.prepare(
        'SELECT status FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(sentDeliveryId)
        .first()
    ).resolves.toEqual({ status: 'sent' });
    await expect(
      env.DB.prepare(
        'SELECT COUNT(*) AS count FROM notification_recipients WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first<{ count: number }>()
    ).resolves.toEqual({ count: 1 });
  });

  it('completed履歴を保持し、同じNotificationの未来Scheduleだけ削除する', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { notificationId, scheduleId: completedScheduleId } =
      await createAutomaticNotification(gatheringId, '完了済み', {
        status: 'completed',
        startedAt: NOW,
        completedAt: NOW,
        recipientsResolvedAt: NOW,
      });
    const futureScheduleId = await createSchedule(notificationId, {
      status: 'scheduled',
    });

    await applyDeletion(eventId, gatheringId);

    await expect(
      env.DB.prepare(
        'SELECT send_status FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(completedScheduleId)
        .first()
    ).resolves.toEqual({ send_status: 'completed' });
    await expect(
      env.DB.prepare(
        'SELECT 1 FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(futureScheduleId)
        .first()
    ).resolves.toBeNull();
    await expect(
      env.DB.prepare('SELECT 1 FROM notifications WHERE notification_id = ?')
        .bind(notificationId)
        .first()
    ).resolves.not.toBeNull();
  });

  it('Gathering削除が失敗した場合は通知cleanupもロールバックする', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { notificationId, scheduleId } = await createAutomaticNotification(
      gatheringId,
      'ロールバック',
      { status: 'scheduled' }
    );
    await createAudience(scheduleId);
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('参加者') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gatheringId, user!.user_id)
      .run();

    await expect(applyDeletion(eventId, gatheringId)).rejects.toThrow(
      'FOREIGN KEY constraint failed'
    );

    await expect(
      env.DB.prepare('SELECT 1 FROM gatherings WHERE gathering_id = ?')
        .bind(gatheringId)
        .first()
    ).resolves.not.toBeNull();
    await expect(
      env.DB.prepare('SELECT 1 FROM notifications WHERE notification_id = ?')
        .bind(notificationId)
        .first()
    ).resolves.not.toBeNull();
    await expect(
      env.DB.prepare(
        'SELECT send_status FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.toEqual({ send_status: 'scheduled' });
    await expect(
      env.DB.prepare(
        'SELECT 1 FROM notification_audiences WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.not.toBeNull();
  });

  it('Gathering削除が失敗した場合はsource_deleted Stopもロールバックする', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { scheduleId } = await createAutomaticNotification(
      gatheringId,
      'Stopロールバック',
      {
        status: 'sending',
        startedAt: NOW,
        recipientsResolvedAt: NOW,
      }
    );
    const recipientId = await createRecipient(scheduleId);
    const pendingDeliveryId = await createDelivery(recipientId, 'pending');
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('Stop参加者') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gatheringId, user!.user_id)
      .run();

    await expect(applyDeletion(eventId, gatheringId)).rejects.toThrow(
      'FOREIGN KEY constraint failed'
    );

    await expect(
      env.DB.prepare(
        'SELECT send_status, reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).resolves.toEqual({ send_status: 'sending', reason: null });
    await expect(
      env.DB.prepare(
        'SELECT status FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
      )
        .bind(pendingDeliveryId)
        .first()
    ).resolves.toEqual({ status: 'pending' });
  });

  it('Gathering削除後にGeneratorを再実行しても通知を作らない', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    await createAutomaticNotification(gatheringId, '削除前', {
      status: 'scheduled',
    });

    await applyDeletion(eventId, gatheringId);

    const generator = createGatheringNotificationGeneratorService(
      createGatheringNotificationGeneratorRepository(env.DB),
      createNotificationCreationRepository(env.DB),
      '2026-11-07',
      () => NOW
    );
    await expect(generator.generate(gatheringId)).resolves.toBe('not_found');

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE source_type = 'gathering' AND source_id = ?"
    )
      .bind(gatheringId)
      .first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('cleanup後はAudience ResolverとDeliveryの対象にならない', async () => {
    const { eventId, gatheringId } = await createGatheringFixture();
    const { scheduleId } = await createAutomaticNotification(
      gatheringId,
      '停止後',
      {
        status: 'sending',
        startedAt: NOW,
        recipientsResolvedAt: NOW,
      }
    );
    const recipientId = await createRecipient(scheduleId);
    const pendingDeliveryId = await createDelivery(recipientId, 'pending');

    await applyDeletion(eventId, gatheringId);

    const resolverRepository = createNotificationAudienceResolverRepository(
      env.DB
    );
    const resolverCandidates = await resolverRepository.findDueCandidates(
      NOW,
      100
    );
    expect(
      resolverCandidates.some(
        candidate => candidate.notification_schedule_id === scheduleId
      )
    ).toBe(false);
    await expect(
      resolverRepository.claimScheduled(scheduleId, NOW)
    ).resolves.toBe(false);

    const deliveryRepository = createNotificationDeliveryRepository(env.DB);
    const deliveryCandidates = await deliveryRepository.findReadySchedules(
      NOW,
      100
    );
    expect(
      deliveryCandidates.some(
        candidate => candidate.notification_schedule_id === scheduleId
      )
    ).toBe(false);
    await expect(
      deliveryRepository.claimPendingDeliveries([scheduleId], NOW, 100)
    ).resolves.toEqual([]);
    await expect(
      deliveryRepository.claimRetryDeliveries(NOW, NOW, 100, [
        pendingDeliveryId,
      ])
    ).resolves.toEqual([]);
  });
});
