import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 's'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

let staffUserId: number | null = null;
let recipientUserId: number | null = null;
let notificationId: number | null = null;
let scheduleId: number | null = null;
let recipientId: number | null = null;
let deliveryId: number | null = null;

afterEach(async () => {
  if (deliveryId !== null) {
    await workerEnv.DB.prepare(
      'DELETE FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
    )
      .bind(deliveryId)
      .run();
  }
  if (recipientId !== null) {
    await workerEnv.DB.prepare(
      'DELETE FROM notification_recipients WHERE notification_recipient_id = ?'
    )
      .bind(recipientId)
      .run();
  }
  if (scheduleId !== null) {
    await workerEnv.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(scheduleId)
      .run();
  }
  if (notificationId !== null) {
    await workerEnv.DB.prepare(
      'DELETE FROM notifications WHERE notification_id = ?'
    )
      .bind(notificationId)
      .run();
  }
  if (staffUserId !== null) {
    await workerEnv.DB.prepare('DELETE FROM staffs WHERE user_id = ?')
      .bind(staffUserId)
      .run();
  }
  for (const userId of [recipientUserId, staffUserId]) {
    if (userId !== null) {
      await workerEnv.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(userId)
        .run();
    }
  }

  staffUserId = null;
  recipientUserId = null;
  notificationId = null;
  scheduleId = null;
  recipientId = null;
  deliveryId = null;
});

async function insertUser(name: string, staff = false): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  if (!row) throw new Error('Userを作成できませんでした');
  if (staff) {
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(row.user_id)
      .run();
  }
  return row.user_id;
}

async function requestAs(userId: number, path: string): Promise<Response> {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: 'result-query-success-' + userId,
      email: 'result-query-success-' + userId + '@example.com',
      display_name: 'Result query success test',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request('http://example.com' + path, {
      headers: { Authorization: 'Bearer ' + token },
    }),
    testEnv
  );
}

async function createResultFixture() {
  staffUserId = await insertUser('結果照会成功staff', true);
  recipientUserId = await insertUser('結果照会Recipient');

  const notification = await workerEnv.DB.prepare(
    "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('notification_general', 'Result push', 'Result body', 'Result detail', 'Result detail body') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  if (!notification) throw new Error('Notificationを作成できませんでした');
  notificationId = notification.notification_id;

  const schedule = await workerEnv.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, send_status, send_at) VALUES (?, 'completed', '2026-07-23T00:00:00.000Z') RETURNING notification_schedule_id"
  )
    .bind(notificationId)
    .first<{ notification_schedule_id: number }>();
  if (!schedule) throw new Error('Scheduleを作成できませんでした');
  scheduleId = schedule.notification_schedule_id;

  const recipient = await workerEnv.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(scheduleId, recipientUserId)
    .first<{ notification_recipient_id: number }>();
  if (!recipient) throw new Error('Recipientを作成できませんでした');
  recipientId = recipient.notification_recipient_id;

  const delivery = await workerEnv.DB.prepare(
    "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, first_attempt_at, last_attempt_at, sent_at) VALUES (?, NULL, 1, 'sent', 1, '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:01.000Z', '2026-07-23T00:00:02.000Z') RETURNING notification_push_delivery_id"
  )
    .bind(recipientId)
    .first<{ notification_push_delivery_id: number }>();
  if (!delivery) throw new Error('Deliveryを作成できませんでした');
  deliveryId = delivery.notification_push_delivery_id;
}

describe('管理用Recipient Results・Push Delivery Detail API成功経路', () => {
  it('staffがResultsとPush Delivery Detailを200で取得できる', async () => {
    await createResultFixture();

    const resultsResponse = await requestAs(
      staffUserId!,
      `/api/v1/admin/notifications/schedules/${scheduleId}/results?page=1&limit=50`
    );
    expect(resultsResponse.status).toBe(200);
    expect(await resultsResponse.json()).toMatchObject({
      notificationScheduleId: scheduleId,
      recipients: {
        items: [
          {
            notificationRecipientId: recipientId,
            user: {
              userId: recipientUserId,
              userName: '結果照会Recipient',
            },
            deliveries: [
              {
                notificationPushDeliveryId: deliveryId,
                platform: 'ios',
                status: 'sent',
                attemptCount: 1,
                sentAt: '2026-07-23T00:00:02.000Z',
              },
            ],
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          totalCount: 1,
          totalPages: 1,
        },
      },
    });

    const deliveryResponse = await requestAs(
      staffUserId!,
      `/api/v1/admin/notifications/push-deliveries/${deliveryId}`
    );
    expect(deliveryResponse.status).toBe(200);
    expect(await deliveryResponse.json()).toMatchObject({
      notificationPushDeliveryId: deliveryId,
      notificationRecipientId: recipientId,
      firebaseTokenId: null,
      platform: 'ios',
      status: 'sent',
      attemptCount: 1,
      firstAttemptAt: '2026-07-23T00:00:00.000Z',
      lastAttemptAt: '2026-07-23T00:00:01.000Z',
      sentAt: '2026-07-23T00:00:02.000Z',
    });
  });

  it('IDとpageのsafe integer超過を400で拒否する', async () => {
    staffUserId = await insertUser('結果照会safe integer staff', true);
    const tooLarge = String(Number.MAX_SAFE_INTEGER + 1);

    for (const path of [
      `/api/v1/admin/notifications/schedules/${tooLarge}/results`,
      `/api/v1/admin/notifications/push-deliveries/${tooLarge}`,
      `/api/v1/admin/notifications/schedules/1/results?page=${tooLarge}&limit=1`,
    ]) {
      expect((await requestAs(staffUserId, path)).status).toBe(400);
    }
  });
});
