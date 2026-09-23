import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDeliveryMessage } from '../../../src/domain/entities/NotificationDelivery';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';

const NOW = '2026-09-24T12:00:00.000Z';
const commandRepository = createAdminNotificationCommandRepository(env.DB);
const resolverService = createNotificationAudienceResolverService(
  createNotificationAudienceResolverRepository(env.DB)
);
const deliveryRepository = createNotificationDeliveryRepository(env.DB);

interface ScheduleFixture {
  actorUserId: number;
  recipientUserId: number;
  notificationId: number;
  scheduleId: number;
}

async function insertUser(name: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`NotificationDelivery-${name}`)
    .first<{ user_id: number }>();
  if (!row) throw new Error('Delivery用Userを作成できませんでした');
  return row.user_id;
}

async function createSchedule(
  importance: 'low' | 'normal' | 'high' = 'normal'
): Promise<ScheduleFixture> {
  const actorUserId = await insertUser('actor');
  const recipientUserId = await insertUser('recipient');
  const result = await commandRepository.create({
    actor_user_id: actorUserId,
    push_title: 'Delivery push title',
    push_body: 'Delivery push body',
    detail_title: 'Delivery detail title',
    detail_body: 'Delivery detail body',
    importance,
    send_at: '2026-09-24T11:00:00.000Z',
    audiences: [{ type: 'user', target_id: recipientUserId }],
    now: '2026-09-24T10:59:00.000Z',
  });
  return {
    actorUserId,
    recipientUserId,
    notificationId: result.notification_id,
    scheduleId: result.notification_schedule_id,
  };
}

async function insertToken(
  userId: number,
  token: string,
  platform: 1 | 2,
  active = 1
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active)
     VALUES (?, ?, ?, ?) RETURNING firebase_token_id`
  )
    .bind(userId, platform, token, active)
    .first<{ firebase_token_id: number }>();
  if (!row) throw new Error('Delivery用Firebase Tokenを作成できませんでした');
  return row.firebase_token_id;
}

async function resolve(scheduleId: number): Promise<void> {
  const result = await resolverService.resolveDueSchedules(new Date(NOW));
  expect(result.failed_schedule_ids).not.toContain(scheduleId);
  expect(
    result.completed_schedules.map(row => row.notification_schedule_id)
  ).toContain(scheduleId);
}

function createHarness(fcmService?: IFcmService) {
  const messages: NotificationDeliveryMessage[] = [];
  const notificationDeliveryQueue = {
    enqueueMany: vi.fn(async (items: NotificationDeliveryMessage[]) => {
      messages.push(...items);
    }),
  };
  const fcm =
    fcmService ??
    ({
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi.fn(async () => ({
        success: true as const,
        messageId: 'projects/test/messages/default',
      })),
    } satisfies IFcmService);
  const service = createNotificationDeliveryService({
    notificationDeliveryRepository: deliveryRepository,
    notificationDeliveryQueue,
    fcmService: fcm,
  });
  return { service, messages, fcm, notificationDeliveryQueue };
}

async function deliveryRows(scheduleId: number) {
  const rows = await env.DB.prepare(
    `SELECT d.notification_push_delivery_id, d.notification_recipient_id,
            d.firebase_token_id, d.platform, d.status, d.attempt_count,
            d.first_attempt_at, d.last_attempt_at, d.next_retry_at,
            d.failed_reason, d.fcm_message_id, d.sent_at
     FROM notification_push_deliveries d
     JOIN notification_recipients r USING (notification_recipient_id)
     WHERE r.notification_schedule_id = ?
     ORDER BY d.firebase_token_id`
  )
    .bind(scheduleId)
    .all<Record<string, unknown>>();
  return rows.results;
}

async function scheduleStatus(scheduleId: number) {
  return env.DB.prepare(
    'SELECT send_status, completed_at FROM notification_schedules WHERE notification_schedule_id = ?'
  )
    .bind(scheduleId)
    .first<{ send_status: string; completed_at: string | null }>();
}

describe('NotificationDeliveryRepository and Service', () => {
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
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('有効なTokenが0件ならDeliveryを作らずScheduleを完了する', async () => {
    const fixture = await createSchedule();
    await insertToken(fixture.recipientUserId, 'delivery-inactive-token', 1, 0);
    await resolve(fixture.scheduleId);
    const { service, messages } = createHarness();

    const result = await service.enqueueReadySchedules(new Date(NOW));

    expect(result.queued_schedule_ids).toEqual([]);
    expect(result.completed_schedule_ids).toEqual([fixture.scheduleId]);
    expect(result.failed_schedule_ids).toEqual([]);
    expect(messages).toEqual([]);
    expect(await deliveryRows(fixture.scheduleId)).toEqual([]);
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
  });

  it('有効なTokenが1件ならDeliveryを1件生成する', async () => {
    const fixture = await createSchedule();
    const tokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-single-token',
      2
    );
    await resolve(fixture.scheduleId);
    const { service } = createHarness();

    const result = await service.enqueueReadySchedules(new Date(NOW));

    expect(result.queued_schedule_ids).toEqual([fixture.scheduleId]);
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      { firebase_token_id: tokenId, platform: 2, status: 'pending' },
    ]);
  });

  it('有効Tokenごとにplatformを固定し、再実行と後から追加したTokenを重複登録しない', async () => {
    const fixture = await createSchedule('low');
    const iosTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-ios-token',
      1
    );
    const androidTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-android-token',
      2
    );
    await insertToken(fixture.recipientUserId, 'delivery-inactive-token', 1, 0);
    await resolve(fixture.scheduleId);
    const { service, messages } = createHarness();

    const first = await service.enqueueReadySchedules(new Date(NOW));
    expect(first.queued_schedule_ids).toEqual([fixture.scheduleId]);
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      {
        firebase_token_id: iosTokenId,
        platform: 1,
        status: 'pending',
        attempt_count: 0,
        first_attempt_at: null,
        last_attempt_at: null,
        next_retry_at: null,
        failed_reason: null,
        fcm_message_id: null,
        sent_at: null,
      },
      {
        firebase_token_id: androidTokenId,
        platform: 2,
        status: 'pending',
        attempt_count: 0,
        first_attempt_at: null,
        last_attempt_at: null,
        next_retry_at: null,
        failed_reason: null,
        fcm_message_id: null,
        sent_at: null,
      },
    ]);

    await insertToken(fixture.recipientUserId, 'delivery-late-token', 2);
    const second = await service.enqueueReadySchedules(new Date(NOW));
    expect(second.queued_schedule_ids).toEqual([fixture.scheduleId]);
    expect(
      (await deliveryRows(fixture.scheduleId)).map(row => row.firebase_token_id)
    ).toEqual([iosTokenId, androidTokenId]);
    expect(messages).toHaveLength(2);
  });

  it('Deliveryを条件付きclaimし、pending/sending中はScheduleを完了しない', async () => {
    const fixture = await createSchedule();
    await insertToken(fixture.recipientUserId, 'delivery-claim-ios', 1);
    await insertToken(fixture.recipientUserId, 'delivery-claim-android', 2);
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);

    expect(
      await deliveryRepository.completeScheduleIfDone(fixture.scheduleId, NOW)
    ).toBe(false);
    const [firstClaim, concurrentClaim] = await Promise.all([
      deliveryRepository.claimPendingDeliveries([fixture.scheduleId], NOW, 100),
      deliveryRepository.claimPendingDeliveries([fixture.scheduleId], NOW, 100),
    ]);
    const claimed = [...firstClaim, ...concurrentClaim];
    expect(claimed).toHaveLength(2);
    expect(
      new Set(claimed.map(row => row.notification_push_delivery_id)).size
    ).toBe(2);
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      {
        status: 'sending',
        attempt_count: 1,
        first_attempt_at: NOW,
        last_attempt_at: NOW,
      },
      {
        status: 'sending',
        attempt_count: 1,
        first_attempt_at: NOW,
        last_attempt_at: NOW,
      },
    ]);
    expect(
      await deliveryRepository.completeScheduleIfDone(fixture.scheduleId, NOW)
    ).toBe(false);

    for (const delivery of claimed) {
      await deliveryRepository.markSent(
        delivery.notification_push_delivery_id,
        `projects/test/messages/${delivery.firebase_token_id}`,
        NOW
      );
    }
    expect(
      await deliveryRepository.completeScheduleIfDone(fixture.scheduleId, NOW)
    ).toBe(true);
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
  });

  it('FCM success/failureを保存し、manual payloadで部分失敗でもScheduleを完了する', async () => {
    const fixture = await createSchedule('low');
    await insertToken(fixture.recipientUserId, 'delivery-success-token', 1);
    await insertToken(fixture.recipientUserId, 'delivery-failed-token', 2);
    await resolve(fixture.scheduleId);
    const sendNotificationToToken = vi.fn(async (input: { token: string }) => {
      if (input.token === 'delivery-failed-token') {
        throw new Error('FCM token rejected');
      }
      return {
        success: true as const,
        messageId: 'projects/test/messages/success',
      };
    });
    const { service, messages } = createHarness({
      sendTestNotification: vi.fn(),
      sendNotificationToToken,
    });

    const prep = await service.enqueueReadySchedules(new Date(NOW));
    expect(prep.queued_schedule_ids).toEqual([fixture.scheduleId]);
    const result = await service.sendQueuedNotifications(
      [fixture.scheduleId],
      new Date(NOW)
    );

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(sendNotificationToToken).toHaveBeenCalledTimes(2);
    expect(sendNotificationToToken).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delivery push title',
        body: 'Delivery push body',
        importance: 1,
        data: {
          type: 'manual',
          notificationId: String(fixture.notificationId),
        },
      })
    );
    expect(await deliveryRows(fixture.scheduleId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'sent',
          attempt_count: 1,
          fcm_message_id: 'projects/test/messages/success',
          sent_at: NOW,
          failed_reason: null,
        }),
        expect.objectContaining({
          status: 'failed',
          attempt_count: 1,
          failed_reason: 'FCM token rejected',
          sent_at: null,
        }),
      ])
    );
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
    expect(messages).toHaveLength(1);
  });

  it('Delivery生成が継続不能ならScheduleだけfailedにする', async () => {
    const fixture = await createSchedule();
    await insertToken(
      fixture.recipientUserId,
      'delivery-generation-error-token',
      1
    );
    await resolve(fixture.scheduleId);
    await env.DB.prepare(
      `CREATE TRIGGER fail_notification_delivery_generation
       BEFORE INSERT ON notification_push_deliveries
       BEGIN SELECT RAISE(ABORT, 'delivery generation blocked'); END`
    ).run();
    const { service } = createHarness();

    try {
      const result = await service.enqueueReadySchedules(new Date(NOW));
      expect(result.failed_schedule_ids).toEqual([fixture.scheduleId]);
      expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
        send_status: 'failed',
      });
      const failedReason = await env.DB.prepare(
        'SELECT failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first<{ failed_reason: string | null }>();
      expect(failedReason?.failed_reason).toContain(
        'delivery generation blocked'
      );
      expect(await deliveryRows(fixture.scheduleId)).toEqual([]);
    } finally {
      await env.DB.prepare(
        'DROP TRIGGER fail_notification_delivery_generation'
      ).run();
    }
  });
  it('firebase_token_idがnullのpending Deliveryはclaimしない', async () => {
    const fixture = await createSchedule();
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);
    const recipient = await env.DB.prepare(
      'SELECT notification_recipient_id FROM notification_recipients WHERE notification_schedule_id = ?'
    )
      .bind(fixture.scheduleId)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('Delivery用Recipientが見つかりません');
    await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, firebase_token_id, platform, status
       ) VALUES (?, NULL, 1, 'pending')`
    )
      .bind(recipient.notification_recipient_id)
      .run();

    await expect(
      deliveryRepository.claimPendingDeliveries([fixture.scheduleId], NOW, 100)
    ).resolves.toEqual([]);
  });
});
