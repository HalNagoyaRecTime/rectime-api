import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import type { NotificationCreateRequestDTO } from '../src/application/dto/AdminNotificationDTO';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'c'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

async function createStaffToken(): Promise<string> {
  const user = await workerEnv.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('Notification Command API staff', 1) RETURNING user_id"
  ).first<{ user_id: number }>();
  if (!user) throw new Error('API test staffを作成できませんでした');
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(user.user_id)
    .run();
  return signAccessToken(
    {
      sub: String(user.user_id),
      oid: `notification-command-${user.user_id}`,
      email: 'notification-command@example.com',
      display_name: 'Notification Command API staff',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

async function createUserToken(): Promise<string> {
  const user = await workerEnv.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('Notification Query API user', 1) RETURNING user_id"
  ).first<{ user_id: number }>();
  if (!user) throw new Error('API test userを作成できませんでした');
  return signAccessToken(
    {
      sub: String(user.user_id),
      oid: `notification-query-${user.user_id}`,
      email: 'notification-query@example.com',
      display_name: 'Notification Query API user',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

function requestHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Client-Type': 'web',
  };
}

function createBody(
  overrides: Partial<NotificationCreateRequestDTO> = {}
): NotificationCreateRequestDTO {
  return {
    content: {
      push: { title: 'Push title', body: 'Push body' },
      detail: { title: 'Detail title', body: 'Detail body' },
    },
    audience: { items: [{ type: 'all' }] },
    delivery: { type: 'immediate', sendAt: null },
    importance: 'normal',
    ...overrides,
  };
}

async function postNotification(
  token: string,
  body: NotificationCreateRequestDTO
): Promise<Response> {
  return app.fetch(
    new Request('http://example.com/api/v1/admin/notifications', {
      method: 'POST',
      headers: requestHeaders(token),
      body: JSON.stringify(body),
    }),
    testEnv
  );
}

describe('管理通知Command  API', () => {
  beforeEach(async () => {
    await workerEnv.DB.batch([
      workerEnv.DB.prepare('DELETE FROM notification_push_deliveries'),
      workerEnv.DB.prepare('DELETE FROM notification_recipients'),
      workerEnv.DB.prepare('DELETE FROM notification_audiences'),
      workerEnv.DB.prepare('DELETE FROM notification_schedules'),
      workerEnv.DB.prepare('DELETE FROM notifications'),
      workerEnv.DB.prepare('DELETE FROM firebase_tokens'),
      workerEnv.DB.prepare('DELETE FROM gathering_group_members'),
      workerEnv.DB.prepare('DELETE FROM gatherings'),
      workerEnv.DB.prepare('DELETE FROM gathering_spots'),
      workerEnv.DB.prepare('DELETE FROM students'),
      workerEnv.DB.prepare('DELETE FROM staffs'),
      workerEnv.DB.prepare('DELETE FROM teachers'),
      workerEnv.DB.prepare('DELETE FROM events'),
      workerEnv.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('認証済みStaffから作成し、開始後はdetailだけ編集できる', async () => {
    const token = await createStaffToken();
    const postResponse = await postNotification(token, createBody());
    expect(postResponse.status).toBe(201);
    const created = (await postResponse.json()) as {
      notificationId: number;
      notificationScheduleId: number;
    };
    expect(created.notificationId).toBeGreaterThan(0);
    expect(created.notificationScheduleId).toBeGreaterThan(0);

    const stored = await workerEnv.DB.prepare(
      `SELECT n.created_by_user_id, n.notification_type, n.importance,
              s.created_user_id, s.scheduled_by_user_id, s.send_status,
              s.send_at, s.firebase_token_id
       FROM notifications n
       JOIN notification_schedules s USING (notification_id)
       WHERE n.notification_id = ?`
    )
      .bind(created.notificationId)
      .first<Record<string, unknown>>();
    expect(Number(stored?.created_by_user_id)).toBeGreaterThan(0);
    expect(stored?.scheduled_by_user_id).toBe(stored?.created_by_user_id);
    expect(stored).toMatchObject({
      notification_type: 'notification_general',
      importance: 'normal',
      send_status: 'scheduled',
      firebase_token_id: null,
    });
    const sendAt = String(stored?.send_at);
    expect(Date.parse(sendAt)).toBeGreaterThan(0);

    const detailResponse = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications/${created.notificationId}`,
        { headers: requestHeaders(token) }
      ),
      testEnv
    );
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      notificationId: created.notificationId,
      content: {
        push: { title: 'Push title', body: 'Push body' },
        detail: { title: 'Detail title', body: 'Detail body' },
      },
      importance: 'normal',
      creation: {
        method: 'manual',
        user: {
          userId: expect.any(Number),
          userName: 'Notification Command API staff',
        },
        source: null,
      },
      schedules: [
        {
          notificationScheduleId: created.notificationScheduleId,
          audience: { items: [{ type: 'all' }] },
        },
      ],
    });

    const from = new Date(Date.parse(sendAt) - 1000).toISOString();
    const to = new Date(Date.parse(sendAt) + 1000).toISOString();
    const listResponse = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications?${new URLSearchParams({ from, to })}`,
        { headers: requestHeaders(token) }
      ),
      testEnv
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      items: [
        {
          notificationId: created.notificationId,
          content: { push: { title: 'Push title', body: 'Push body' } },
          importance: 'normal',
          schedules: [
            { notificationScheduleId: created.notificationScheduleId },
          ],
        },
      ],
    });

    await workerEnv.DB.prepare(
      `UPDATE notification_schedules SET started_at = CURRENT_TIMESTAMP
       WHERE notification_schedule_id = ?`
    )
      .bind(created.notificationScheduleId)
      .run();

    const detailPatch = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications/${created.notificationId}`,
        {
          method: 'PATCH',
          headers: requestHeaders(token),
          body: JSON.stringify({
            content: { detail: { title: 'Patch detail' } },
          }),
        }
      ),
      testEnv
    );
    expect(detailPatch.status).toBe(200);
    expect(await detailPatch.json()).toMatchObject({
      notificationId: created.notificationId,
      content: {
        push: { title: 'Push title', body: 'Push body' },
        detail: { title: 'Patch detail', body: 'Detail body' },
      },
      importance: 'normal',
      creation: {
        method: 'manual',
        user: {
          userId: expect.any(Number),
          userName: 'Notification Command API staff',
        },
        source: null,
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      schedules: [
        {
          notificationScheduleId: created.notificationScheduleId,
          sendAt: expect.any(String),
          status: 'scheduled',
          stop: null,
          scheduledBy: {
            userId: expect.any(Number),
            userName: 'Notification Command API staff',
          },
          createdAt: expect.any(String),
          audience: {
            items: [{ type: 'all' }],
            recipientResolution: { status: 'pending', resolvedCount: 0 },
          },
          recipientPushSummary: {
            totalCount: 0,
            successCount: 0,
            failedCount: 0,
            noPushTargetCount: 0,
          },
        },
      ],
    });

    const pushPatch = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications/${created.notificationId}`,
        {
          method: 'PATCH',
          headers: requestHeaders(token),
          body: JSON.stringify({ content: { push: { title: 'Forbidden' } } }),
        }
      ),
      testEnv
    );
    expect(pushPatch.status).toBe(409);
    expect(await pushPatch.json()).toMatchObject({
      error: { code: 'NOTIFICATION_EDIT_NOT_ALLOWED' },
    });

    const deletion = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications/${created.notificationId}`,
        { method: 'DELETE', headers: requestHeaders(token) }
      ),
      testEnv
    );
    expect(deletion.status).toBe(409);
    expect(await deletion.json()).toMatchObject({
      error: { code: 'NOTIFICATION_DELETE_NOT_ALLOWED' },
    });
  });

  it('high importanceを403で拒否し、Audienceが存在しない場合は404にする', async () => {
    const token = await createStaffToken();
    const high = await postNotification(
      token,
      createBody({ importance: 'high' })
    );
    expect(high.status).toBe(403);
    expect(await high.json()).toMatchObject({
      error: { code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN' },
    });

    const missingAudience = await postNotification(
      token,
      createBody({ audience: { items: [{ type: 'user', targetId: 999999 }] } })
    );
    expect(missingAudience.status).toBe(404);
    expect(await missingAudience.json()).toMatchObject({
      error: { code: 'NOTIFICATION_AUDIENCE_NOT_FOUND' },
    });
  });

  it('未開始のmanual通知を204で削除する', async () => {
    const token = await createStaffToken();
    const createdResponse = await postNotification(token, createBody());
    const created = (await createdResponse.json()) as {
      notificationId: number;
      notificationScheduleId: number;
    };

    const response = await app.fetch(
      new Request(
        `http://example.com/api/v1/admin/notifications/${created.notificationId}`,
        { method: 'DELETE', headers: requestHeaders(token) }
      ),
      testEnv
    );

    expect(response.status).toBe(204);
    const root = await workerEnv.DB.prepare(
      'SELECT notification_id FROM notifications WHERE notification_id = ?'
    )
      .bind(created.notificationId)
      .first();
    const schedule = await workerEnv.DB.prepare(
      'SELECT notification_schedule_id FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(created.notificationScheduleId)
      .first();
    expect(root).toBeNull();
    expect(schedule).toBeNull();
  });

  it('一般UserはAdmin Notificationの一覧・詳細を403で拒否される', async () => {
    const token = await createUserToken();

    for (const path of [
      '/api/v1/admin/notifications',
      '/api/v1/admin/notifications/1',
    ]) {
      const response = await app.fetch(
        new Request(`http://example.com${path}`, {
          headers: requestHeaders(token),
        }),
        testEnv
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: 'STAFF_REQUIRED' },
      });
    }
  });

  it('Notification IDのsafe integer境界をGET・PATCH・DELETEで統一する', async () => {
    const token = await createStaffToken();
    const methods = ['GET', 'PATCH', 'DELETE'] as const;
    const patchBody = JSON.stringify({
      content: { detail: { title: '更新Detail' } },
    });

    for (const method of methods) {
      const response = await app.fetch(
        new Request(
          `http://example.com/api/v1/admin/notifications/${Number.MAX_SAFE_INTEGER}`,
          {
            method,
            headers: requestHeaders(token),
            ...(method === 'PATCH' ? { body: patchBody } : {}),
          }
        ),
        testEnv
      );
      expect(response.status).toBe(404);
    }

    for (const notificationId of [
      String(Number.MAX_SAFE_INTEGER + 1),
      '9'.repeat(100),
    ]) {
      for (const method of methods) {
        const response = await app.fetch(
          new Request(
            `http://example.com/api/v1/admin/notifications/${notificationId}`,
            {
              method,
              headers: requestHeaders(token),
              ...(method === 'PATCH' ? { body: patchBody } : {}),
            }
          ),
          testEnv
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          error: { code: 'VALIDATION_ERROR' },
        });
      }
    }
  });
});
