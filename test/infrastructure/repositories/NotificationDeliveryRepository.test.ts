import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDeliveryMessage } from '../../../src/domain/entities/NotificationDelivery';
import {
  FcmRequestError,
  type IFcmService,
} from '../../../src/application/services/IFcmService';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';

const NOW = '2026-09-24T12:00:00.000Z';
const commandRepository = createAdminNotificationCommandRepository(env.DB);
const resolverService = createNotificationAudienceResolverService(
  createNotificationAudienceResolverRepository(env.DB)
);
const deliveryRepository = createNotificationDeliveryRepository(env.DB);
const firebaseTokenRepository = createFirebaseTokenRepository(env.DB);

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
      sendNotificationToToken: vi.fn(async () => ({
        success: true as const,
        messageId: 'projects/test/messages/default',
      })),
    } satisfies IFcmService);
  const service = createNotificationDeliveryService({
    notificationDeliveryRepository: deliveryRepository,
    firebaseTokenRepository,
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

  it.each(['初回', '再送', 'timeout回収'] as const)(
    '100件の%s配信でD1のbind上限を超えず全件送信する',
    async mode => {
      const fixture = await createSchedule();
      for (let index = 0; index < 100; index++) {
        await insertToken(
          fixture.recipientUserId,
          `配信上限テスト-${index}`,
          1
        );
      }
      await resolve(fixture.scheduleId);
      const h = createHarness();
      await h.service.enqueueReadySchedules(new Date(NOW));
      let result;
      if (mode === '初回') {
        result = await h.service.sendQueuedNotifications(
          [fixture.scheduleId],
          new Date(NOW)
        );
      } else {
        const claimed = await deliveryRepository.claimPendingDeliveries(
          [fixture.scheduleId],
          NOW,
          100
        );
        expect(claimed).toHaveLength(100);
        if (mode === '再送') {
          await env.DB.prepare(
            "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = ?"
          )
            .bind(NOW)
            .run();
        }
        const retryService = createNotificationRetryService({
          notificationDeliveryRepository: deliveryRepository,
          firebaseTokenRepository,
          fcmService: h.fcm,
        });
        result = await retryService.retryDueDeliveries(
          new Date(Date.parse(NOW) + 121_000)
        );
      }
      expect(result).toEqual({ claimed: 100, sent: 100, failed: 0 });
      expect(h.fcm.sendNotificationToToken).toHaveBeenCalledTimes(100);
      expect(await deliveryRows(fixture.scheduleId)).toHaveLength(100);
      expect(
        (await deliveryRows(fixture.scheduleId)).every(
          row => row.status === 'sent'
        )
      ).toBe(true);
      expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
        send_status: 'completed',
      });
    }
  );

  it('Tokenが存在しない場合はDeliveryを作らずScheduleを完了する', async () => {
    const fixture = await createSchedule();
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

  it('Token削除でpending + NULLになったDeliveryをfailedにしてScheduleを完了する', async () => {
    const fixture = await createSchedule();
    const tokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-removed-before-cron-token',
      1
    );
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .run();

    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      { firebase_token_id: null, status: 'pending' },
    ]);

    const sendNotificationToToken = vi.fn(async () => ({
      success: true as const,
      messageId: 'projects/test/messages/unused',
    }));
    const { service, messages } = createHarness({
      sendNotificationToToken,
    });
    const result = await service.enqueueReadySchedules(new Date(NOW));

    expect(result.queued_schedule_ids).toEqual([]);
    expect(result.completed_schedule_ids).toEqual([fixture.scheduleId]);
    expect(result.failed_schedule_ids).toEqual([]);
    expect(messages).toEqual([]);
    expect(sendNotificationToToken).not.toHaveBeenCalled();
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      {
        firebase_token_id: null,
        status: 'failed',
        failed_reason: 'Firebase token was removed before delivery',
        sent_at: null,
        next_retry_at: null,
      },
    ]);
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
  });

  it('有効Tokenと削除済みTokenが混在する場合は有効分だけQueueへ積む', async () => {
    const fixture = await createSchedule();
    const activeTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-active-token',
      1
    );
    const removedTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-removed-token',
      2
    );
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(removedTokenId)
      .run();

    const sendNotificationToToken = vi.fn(async (input: { token: string }) => ({
      success: true as const,
      messageId: `projects/test/messages/${input.token}`,
    }));
    const { service, messages } = createHarness({
      sendNotificationToToken,
    });
    const prepared = await service.enqueueReadySchedules(new Date(NOW));

    expect(prepared.queued_schedule_ids).toEqual([fixture.scheduleId]);
    expect(prepared.completed_schedule_ids).toEqual([]);
    expect(messages).toEqual([
      { notificationScheduleIds: [fixture.scheduleId] },
    ]);
    expect(await deliveryRows(fixture.scheduleId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firebase_token_id: activeTokenId,
          status: 'pending',
        }),
        expect.objectContaining({
          firebase_token_id: null,
          status: 'failed',
          failed_reason: 'Firebase token was removed before delivery',
        }),
      ])
    );
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'sending',
    });

    const sent = await service.sendQueuedNotifications(
      [fixture.scheduleId],
      new Date(NOW)
    );

    expect(sent).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(sendNotificationToToken).toHaveBeenCalledOnce();
    expect(sendNotificationToToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'delivery-active-token' })
    );
    expect(await deliveryRows(fixture.scheduleId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firebase_token_id: activeTokenId,
          status: 'sent',
        }),
        expect.objectContaining({ firebase_token_id: null, status: 'failed' }),
      ])
    );
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
  });

  it('sending + NULL Deliveryはfailedへ変更せずScheduleもsendingのままにする', async () => {
    const fixture = await createSchedule();
    const tokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-removed-after-claim-token',
      1
    );
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);
    await expect(
      deliveryRepository.claimPendingDeliveries([fixture.scheduleId], NOW, 100)
    ).resolves.toHaveLength(1);
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .run();

    const sendNotificationToToken = vi.fn(async () => ({
      success: true as const,
      messageId: 'projects/test/messages/unused',
    }));
    const { service } = createHarness({
      sendNotificationToToken,
    });
    const result = await service.sendQueuedNotifications(
      [fixture.scheduleId],
      new Date(NOW)
    );

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(sendNotificationToToken).not.toHaveBeenCalled();
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      { firebase_token_id: null, status: 'sending' },
    ]);
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'sending',
    });
  });

  it('Queue作成後にTokenが削除されたDeliveryを送信せずfailedに終端化する', async () => {
    const fixture = await createSchedule();
    const tokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-removed-after-queue-token',
      1
    );
    await resolve(fixture.scheduleId);
    const sendNotificationToToken = vi.fn(async () => ({
      success: true as const,
      messageId: 'projects/test/messages/unused',
    }));
    const { service, messages } = createHarness({
      sendNotificationToToken,
    });
    const prepared = await service.enqueueReadySchedules(new Date(NOW));
    expect(prepared.queued_schedule_ids).toEqual([fixture.scheduleId]);

    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .run();
    const result = await service.sendQueuedNotifications(
      [fixture.scheduleId],
      new Date(NOW)
    );

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 1 });
    expect(messages).toEqual([
      { notificationScheduleIds: [fixture.scheduleId] },
    ]);
    expect(sendNotificationToToken).not.toHaveBeenCalled();
    expect(await deliveryRows(fixture.scheduleId)).toMatchObject([
      {
        firebase_token_id: null,
        status: 'failed',
        failed_reason: 'Firebase token was removed before delivery',
      },
    ]);
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
  });

  it('全Tokenをplatform snapshotし、再実行と後から追加したTokenを重複登録しない', async () => {
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
    const inactiveTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-inactive-token',
      1,
      0
    );
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
      {
        firebase_token_id: inactiveTokenId,
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
    ]);

    await insertToken(fixture.recipientUserId, 'delivery-late-token', 2);
    const second = await service.enqueueReadySchedules(new Date(NOW));
    expect(second.queued_schedule_ids).toEqual([fixture.scheduleId]);
    expect(
      (await deliveryRows(fixture.scheduleId)).map(row => row.firebase_token_id)
    ).toEqual([iosTokenId, androidTokenId, inactiveTokenId]);
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

  it('FCM success/failureを保存し、既存モバイル互換のpayloadで部分失敗でもScheduleを完了する', async () => {
    const fixture = await createSchedule('low');
    await insertToken(fixture.recipientUserId, 'delivery-success-token', 1);
    await insertToken(fixture.recipientUserId, 'delivery-failed-token', 2);
    await resolve(fixture.scheduleId);
    const sendNotificationToToken = vi.fn(async (input: { token: string }) => {
      if (input.token === 'delivery-failed-token') {
        throw new FcmRequestError(
          400,
          'INVALID_ARGUMENT',
          'FCM token rejected'
        );
      }
      return {
        success: true as const,
        messageId: 'projects/test/messages/success',
      };
    });
    const { service, messages } = createHarness({
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
    const failedToken = await env.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE fcm_token = ?'
    )
      .bind('delivery-failed-token')
      .first<{ firebase_token_id: number }>();
    expect(failedToken).not.toBeNull();
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
    expect(messages).toHaveLength(1);
  });

  it('UNREGISTERED時は該当Tokenだけを物理削除し、Deliveryをfailedで保持する', async () => {
    const fixture = await createSchedule();
    const invalidTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-unregistered-token',
      1
    );
    const activeTokenId = await insertToken(
      fixture.recipientUserId,
      'delivery-active-after-unregistered-token',
      2
    );
    await resolve(fixture.scheduleId);
    const sendNotificationToToken = vi.fn(async (input: { token: string }) => {
      if (input.token === 'delivery-unregistered-token') {
        throw new FcmRequestError(
          404,
          'UNREGISTERED',
          'FCM request failed: HTTP 404 UNREGISTERED'
        );
      }
      return {
        success: true as const,
        messageId: 'projects/test/messages/active',
      };
    });
    const { service } = createHarness({
      sendNotificationToToken,
    });

    await service.enqueueReadySchedules(new Date(NOW));
    const result = await service.sendQueuedNotifications(
      [fixture.scheduleId],
      new Date(NOW)
    );

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    const remainingTokens = await env.DB.prepare(
      'SELECT firebase_token_id, fcm_token FROM firebase_tokens ORDER BY firebase_token_id'
    ).all<{ firebase_token_id: number; fcm_token: string }>();
    expect(remainingTokens.results).toEqual([
      {
        firebase_token_id: activeTokenId,
        fcm_token: 'delivery-active-after-unregistered-token',
      },
    ]);
    const rows = await deliveryRows(fixture.scheduleId);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firebase_token_id: null,
          status: 'failed',
          failed_reason: 'FCM request failed: HTTP 404 UNREGISTERED',
        }),
        expect.objectContaining({
          firebase_token_id: activeTokenId,
          status: 'sent',
        }),
      ])
    );
    expect(rows).toHaveLength(2);
    expect(rows.some(row => row.firebase_token_id === invalidTokenId)).toBe(
      false
    );
    expect(await scheduleStatus(fixture.scheduleId)).toMatchObject({
      send_status: 'completed',
    });
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
        'SELECT reason, failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(fixture.scheduleId)
        .first<{ reason: string | null; failed_reason: string | null }>();
      expect(failedReason?.reason).toContain('delivery generation blocked');
      expect(failedReason?.failed_reason).toBeNull();
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

  it('is_firebase_activeが0のTokenもv2 Deliveryへ含める', async () => {
    const fixture = await createSchedule();
    const tokenId = await insertToken(
      fixture.recipientUserId,
      'inactive-legacy-token',
      1,
      0
    );
    await resolve(fixture.scheduleId);
    await deliveryRepository.prepareResolvedSchedule(fixture.scheduleId, NOW);
    const rows = await deliveryRows(fixture.scheduleId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ firebase_token_id: tokenId });
  });
});
