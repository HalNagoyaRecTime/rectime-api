import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationResultQueryRepository } from '../../../src/infrastructure/repositories/NotificationResultQueryRepository';

const repository = createNotificationResultQueryRepository(env.DB);

async function insertUser(userName: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  if (!row) throw new Error('ユーザーを作成できませんでした');
  return row.user_id;
}

async function insertNotification(
  notificationType: 'notification_general' | 'manual' = 'notification_general'
): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES (?, 'Push title', 'Push body', 'Detail title', 'Detail body') RETURNING notification_id"
  )
    .bind(notificationType)
    .first<{ notification_id: number }>();
  if (!row) throw new Error('通知を作成できませんでした');
  return row.notification_id;
}

async function insertSchedule(notificationId: number): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, send_status, send_at) VALUES (?, 'completed', '2026-07-23T00:00:00.000Z') RETURNING notification_schedule_id"
  )
    .bind(notificationId)
    .first<{ notification_schedule_id: number }>();
  if (!row) throw new Error('Scheduleを作成できませんでした');
  return row.notification_schedule_id;
}

async function insertRecipient(scheduleId: number, userId: number) {
  const row = await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(scheduleId, userId)
    .first<{ notification_recipient_id: number }>();
  if (!row) throw new Error('Recipientを作成できませんでした');
  return row.notification_recipient_id;
}

async function insertToken(userId: number, platform: 1 | 2, suffix: string) {
  const row = await env.DB.prepare(
    'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, ?, ?) RETURNING firebase_token_id'
  )
    .bind(userId, platform, 'result-query-token-' + suffix)
    .first<{ firebase_token_id: number }>();
  if (!row) throw new Error('Tokenを作成できませんでした');
  return row.firebase_token_id;
}

async function insertDelivery(
  recipientId: number,
  tokenId: number,
  input: {
    platform: 1 | 2;
    status: string;
    attemptCount: number;
    firstAttemptAt: string;
    lastAttemptAt: string;
    nextRetryAt?: string | null;
    sentAt?: string | null;
    failedReason?: string | null;
    fcmMessageId?: string | null;
  }
): Promise<number> {
  const query = [
    'INSERT INTO notification_push_deliveries (',
    'notification_recipient_id, firebase_token_id, platform, status,',
    'attempt_count, first_attempt_at, last_attempt_at, next_retry_at,',
    'sent_at, failed_reason, fcm_message_id)',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'RETURNING notification_push_delivery_id',
  ].join(' ');
  const row = await env.DB.prepare(query)
    .bind(
      recipientId,
      tokenId,
      input.platform,
      input.status,
      input.attemptCount,
      input.firstAttemptAt,
      input.lastAttemptAt,
      input.nextRetryAt ?? null,
      input.sentAt ?? null,
      input.failedReason ?? null,
      input.fcmMessageId ?? null
    )
    .first<{ notification_push_delivery_id: number }>();
  if (!row) throw new Error('Deliveryを作成できませんでした');
  return row.notification_push_delivery_id;
}

describe('NotificationResultQueryRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('Legacy Notification配下のScheduleはResults対象外としてnullを返す', async () => {
    const notificationId = await insertNotification('manual');
    const legacyScheduleId = await insertSchedule(notificationId);

    await expect(
      repository.findScheduleResults(legacyScheduleId, {
        page: 1,
        limit: 50,
      })
    ).resolves.toBeNull();
  });

  it('Recipient基準でページングし、0 Tokenと複数Delivery・status混在を返す', async () => {
    const notificationId = await insertNotification();
    const scheduleId = await insertSchedule(notificationId);
    const emptyUser = await insertUser('TokenなしRecipient');
    const singleUser = await insertUser('SentのみRecipient');
    const multiUser = await insertUser('複数DeliveryRecipient');
    const emptyRecipientId = await insertRecipient(scheduleId, emptyUser);
    const singleRecipientId = await insertRecipient(scheduleId, singleUser);
    const multiRecipientId = await insertRecipient(scheduleId, multiUser);

    const singleToken = await insertToken(singleUser, 1, 'single');
    const singleDeliveryId = await insertDelivery(
      singleRecipientId,
      singleToken,
      {
        platform: 1,
        status: 'sent',
        attemptCount: 1,
        firstAttemptAt: '2026-07-23T00:00:00.000Z',
        lastAttemptAt: '2026-07-23T00:00:01.000Z',
        sentAt: '2026-07-23T00:00:02.000Z',
        fcmMessageId: 'sent-message',
      }
    );

    const multiDeliveries: Array<{ deliveryId: number; status: string }> = [];
    for (const [index, status] of [
      'sent',
      'failed',
      'retry_wait',
      'stopped',
    ].entries()) {
      const platform: 1 | 2 = index % 2 === 0 ? 1 : 2;
      const tokenId = await insertToken(multiUser, platform, 'multi-' + index);
      const deliveryId = await insertDelivery(multiRecipientId, tokenId, {
        platform,
        status,
        attemptCount: index + 1,
        firstAttemptAt: '2026-07-23T00:00:00.000Z',
        lastAttemptAt: '2026-07-23T00:00:0' + (index + 1) + '.000Z',
        nextRetryAt:
          status === 'retry_wait' ? '2026-07-23T00:05:00.000Z' : null,
        sentAt: status === 'sent' ? '2026-07-23T00:00:10.000Z' : null,
        failedReason: status === 'failed' ? 'unavailable' : null,
        fcmMessageId: status === 'sent' ? 'multi-sent-message' : null,
      });
      multiDeliveries.push({ deliveryId, status });
    }

    const prepareSpy = vi.spyOn(env.DB, 'prepare');
    const firstPage = await repository.findScheduleResults(scheduleId, {
      page: 1,
      limit: 2,
    });
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    prepareSpy.mockRestore();

    expect(firstPage).toMatchObject({
      notification_schedule_id: scheduleId,
      total_count: 3,
      recipients: [
        {
          notification_recipient_id: emptyRecipientId,
          user_id: emptyUser,
          user_name: 'TokenなしRecipient',
          deliveries: [],
        },
        {
          notification_recipient_id: singleRecipientId,
          user_id: singleUser,
          user_name: 'SentのみRecipient',
          deliveries: [
            {
              notification_push_delivery_id: singleDeliveryId,
              platform: 1,
              status: 'sent',
              attempt_count: 1,
              sent_at: '2026-07-23T00:00:02.000Z',
            },
          ],
        },
      ],
    });

    const secondPage = await repository.findScheduleResults(scheduleId, {
      page: 2,
      limit: 2,
    });
    expect(secondPage?.recipients).toHaveLength(1);
    expect(secondPage?.recipients[0]?.notification_recipient_id).toBe(
      multiRecipientId
    );
    expect(secondPage?.recipients[0]?.deliveries).toHaveLength(4);
    expect(
      secondPage?.recipients[0]?.deliveries.map(delivery => delivery.status)
    ).toEqual(['sent', 'failed', 'retry_wait', 'stopped']);

    const emptyScheduleId = await insertSchedule(notificationId);
    await expect(
      repository.findScheduleResults(emptyScheduleId, { page: 1, limit: 50 })
    ).resolves.toMatchObject({
      notification_schedule_id: emptyScheduleId,
      total_count: 0,
      recipients: [],
    });
    await expect(
      repository.findScheduleResults(999999, { page: 1, limit: 50 })
    ).resolves.toBeNull();
  });

  it('Token削除後もPush Delivery詳細を残してToken IDをnullで返し、1 queryで取得する', async () => {
    const notificationId = await insertNotification();
    const scheduleId = await insertSchedule(notificationId);
    const userId = await insertUser('Token削除テストRecipient');
    const recipientId = await insertRecipient(scheduleId, userId);
    const tokenId = await insertToken(userId, 2, 'deleted');
    const deliveryId = await insertDelivery(recipientId, tokenId, {
      platform: 2,
      status: 'retry_wait',
      attemptCount: 3,
      firstAttemptAt: '2026-07-23T00:00:00.000Z',
      lastAttemptAt: '2026-07-23T00:02:00.000Z',
      nextRetryAt: '2026-07-23T00:07:00.000Z',
      failedReason: 'temporary unavailable',
    });
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .run();

    const prepareSpy = vi.spyOn(env.DB, 'prepare');
    await expect(repository.findPushDeliveryById(deliveryId)).resolves.toEqual({
      notification_push_delivery_id: deliveryId,
      notification_recipient_id: recipientId,
      firebase_token_id: null,
      platform: 2,
      status: 'retry_wait',
      attempt_count: 3,
      first_attempt_at: '2026-07-23T00:00:00.000Z',
      last_attempt_at: '2026-07-23T00:02:00.000Z',
      next_retry_at: '2026-07-23T00:07:00.000Z',
      sent_at: null,
      failed_reason: 'temporary unavailable',
      fcm_message_id: null,
    });
    expect(prepareSpy).toHaveBeenCalledTimes(1);
    prepareSpy.mockRestore();

    await expect(repository.findPushDeliveryById(999999)).resolves.toBeNull();
  });
});
