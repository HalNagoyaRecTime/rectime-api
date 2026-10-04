import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';
import {
  mobileNotificationListResponseSchema,
  mobileNotificationResponseSchema,
} from '../src/presentation/openapi/notification/mobileNotifications';

const JWT_SECRET = 'mobile-history-test-secret-32-characters';
const testEnv: Env = { ...env, JWT_SECRET };
const userIds: number[] = [];
const notificationIds: number[] = [];

afterEach(async () => {
  for (const id of notificationIds) {
    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_id = ?'
    )
      .bind(id)
      .run();
    await env.DB.prepare('DELETE FROM notifications WHERE notification_id = ?')
      .bind(id)
      .run();
  }
  for (const id of userIds) {
    await env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id).run();
  }
  userIds.length = 0;
  notificationIds.length = 0;
});

async function createUser(name: string) {
  const user = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  userIds.push(user!.user_id);
  return user!.user_id;
}

async function addRecipient(
  notificationId: number,
  userId: number,
  sendAt: string
) {
  const schedule = await env.DB.prepare(
    "INSERT INTO notification_schedules (notification_id, send_status, send_at) VALUES (?, 'failed', ?) RETURNING notification_schedule_id"
  )
    .bind(notificationId, sendAt)
    .first<{ notification_schedule_id: number }>();
  await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?)'
  )
    .bind(schedule!.notification_schedule_id, userId)
    .run();
}

async function createNotification(userId: number, sendAt: string) {
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('notification_general', 'Pushタイトル', 'Push本文', '履歴タイトル', '履歴本文') RETURNING notification_id"
  ).first<{ notification_id: number }>();
  notificationIds.push(notification!.notification_id);
  await addRecipient(notification!.notification_id, userId, sendAt);
  return notification!.notification_id;
}

async function requestAs(userId: number, path: string) {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: `mobile-history-${userId}`,
      email: `mobile-history-${userId}@example.com`,
      display_name: 'Mobile履歴テスト',
      client_type: 'mobile',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request(`https://example.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'mobile' },
    }),
    testEnv
  );
}

describe('Mobile通知履歴APIのRecipient基準回帰', () => {
  it('実Route・認証・DIを通してToken非依存のv2履歴、重複排除、pagination、本人限定詳細を返す', async () => {
    const userId = await createUser('Mobile本人');
    const otherId = await createUser('Mobile他人');
    const firstId = await createNotification(
      userId,
      '2026-07-23T00:00:00.000Z'
    );
    const secondId = await createNotification(
      userId,
      '2026-07-23T01:00:00.000Z'
    );
    await addRecipient(secondId, userId, '2026-07-23T02:00:00.000Z');
    const otherNotificationId = await createNotification(
      otherId,
      '2026-07-23T03:00:00.000Z'
    );
    const expected = {
      notification_id: secondId,
      notification_type: 'notification_general',
      title: '履歴タイトル',
      body: '履歴本文',
      scheduled_at: '2026-07-23T02:00:00.000Z',
    };

    const list = await requestAs(userId, '/api/v1/me/notifications');
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toEqual({
      notifications: [
        expected,
        {
          ...expected,
          notification_id: firstId,
          scheduled_at: '2026-07-23T00:00:00.000Z',
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });
    expect(
      mobileNotificationListResponseSchema.safeParse(listBody).success
    ).toBe(true);

    const page = await requestAs(
      userId,
      '/api/v1/me/notifications?limit=1&offset=1'
    );
    expect(page.status).toBe(200);
    expect(await page.json()).toEqual({
      notifications: [
        {
          ...expected,
          notification_id: firstId,
          scheduled_at: '2026-07-23T00:00:00.000Z',
        },
      ],
      total: 2,
      limit: 1,
      offset: 1,
    });

    const detail = await requestAs(
      userId,
      `/api/v1/me/notifications/${secondId}`
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody).toEqual(expected);
    expect(mobileNotificationResponseSchema.safeParse(detailBody).success).toBe(
      true
    );

    const hidden = await requestAs(
      userId,
      `/api/v1/me/notifications/${otherNotificationId}`
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual({
      error: {
        code: 'NOTIFICATION_NOT_FOUND',
        message: '通知が見つかりません',
      },
    });
    expect(
      await env.DB.prepare(
        'SELECT notification_type FROM notifications WHERE notification_id = ?'
      )
        .bind(secondId)
        .first()
    ).toEqual({ notification_type: 'notification_general' });
  });

  it('実RouteでNotification IDのsafe integer境界を検証する', async () => {
    const userId = await createUser('ID境界テスト');

    const maximum = await requestAs(
      userId,
      `/api/v1/me/notifications/${Number.MAX_SAFE_INTEGER}`
    );
    expect(maximum.status).toBe(404);

    for (const id of [
      String(Number.MAX_SAFE_INTEGER + 1),
      '9'.repeat(100),
      '0',
      '-1',
      'not-a-number',
    ]) {
      const response = await requestAs(
        userId,
        `/api/v1/me/notifications/${id}`
      );
      expect(response.status, id).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });

  it('実Routeでpagination境界と空queryのdefaultを検証する', async () => {
    const userId = await createUser('pagination境界テスト');

    const defaults = await requestAs(userId, '/api/v1/me/notifications');
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toMatchObject({ limit: 50, offset: 0 });

    for (const query of [
      'limit=0',
      'limit=101',
      'offset=-1',
      `offset=${Number.MAX_SAFE_INTEGER + 1}`,
    ]) {
      const response = await requestAs(
        userId,
        `/api/v1/me/notifications?${query}`
      );
      expect(response.status, query).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    }
  });
});
