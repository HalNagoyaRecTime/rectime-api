import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IAdminNotificationManagementService } from '../../../src/application/services/IAdminNotificationManagementService';
import type { Env } from '../../../src/lib/env';
import { createAdminNotificationManagementController } from '../../../src/presentation/controllers/AdminNotificationManagementController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/sessionAuthentication';

const notification = {
  notification_id: 10,
  notification_type: 'manual',
  title: '集合場所のお知らせ',
  body: '体育館前へ集合してください。',
  scheduled_at: '2026-07-23T09:00:00+09:00',
  related_event_id: null,
  related_event_name: null,
  created_user_id: 1,
  creator_name: '管理者',
  recipient_count: 2,
  audience: { type: 'resolved_recipients' as const, recipient_count: 2 },
  delivery_summary: {
    total: 2,
    draft: 2,
    sending: 0,
    sent: 0,
    failed: 0,
  },
  created_at: '2026-07-20T09:00:00Z',
  updated_at: '2026-07-20T09:00:00Z',
};

function setup() {
  const service: IAdminNotificationManagementService = {
    canManageAdminNotifications: vi.fn().mockResolvedValue(true),
    getAdminNotifications: vi
      .fn()
      .mockResolvedValue({ notifications: [notification], total: 1 }),
    getAdminNotificationById: vi.fn().mockResolvedValue(notification),
    updateAdminNotification: vi.fn().mockResolvedValue(notification),
    deleteAdminNotification: vi.fn().mockResolvedValue(undefined),
  };
  const controller = createAdminNotificationManagementController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie')?.includes('session=session-id') ? 1 : null
    );
    await next();
  });
  app.get('/admin/notifications', c => controller.getAdminNotifications(c));
  app.get('/admin/notifications/:notificationId', c =>
    controller.getAdminNotificationById(c)
  );
  app.put('/admin/notifications/:notificationId', c =>
    controller.updateAdminNotification(c)
  );
  app.delete('/admin/notifications/:notificationId', c =>
    controller.deleteAdminNotification(c)
  );
  const request = async (
    path: string,
    init: RequestInit = {},
    authenticated = true
  ): Promise<Response> =>
    await app.request(
      path,
      {
        ...init,
        headers: {
          ...(authenticated ? { Cookie: 'session=session-id' } : {}),
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
      },
      {} as Env
    );
  return { service, request };
}

describe('AdminNotificationManagementController', () => {
  it('一覧条件とページネーションを返す', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/notifications?sendStatus=draft&eventId=2&from=2026-07-23T08%3A00%3A00%2B09%3A00&to=2026-07-23T10%3A00%3A00%2B09%3A00&limit=20&offset=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [notification],
      total: 1,
      limit: 20,
      offset: 10,
    });
    expect(service.getAdminNotifications).toHaveBeenCalledWith({
      send_status: 'draft',
      event_id: 2,
      from: '2026-07-23T08:00:00+09:00',
      to: '2026-07-23T10:00:00+09:00',
      limit: 20,
      offset: 10,
    });
  });

  it('通知詳細を返す', async () => {
    const { request } = setup();

    const response = await request('/admin/notifications/10');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(notification);
  });

  it('本文・予定時刻・対象を更新する', async () => {
    const { service, request } = setup();

    const response = await request('/admin/notifications/10', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '変更後',
        scheduledAt: '2026-07-23T10:00:00+09:00',
        audience: { type: 'gathering', gatheringId: 3 },
      }),
    });

    expect(response.status).toBe(200);
    expect(service.updateAdminNotification).toHaveBeenCalledWith({
      notification_id: 10,
      title: '変更後',
      body: undefined,
      scheduled_at: '2026-07-23T10:00:00+09:00',
      audience: { type: 'gathering', gathering_id: 3 },
    });
  });

  it('draft通知を削除して204を返す', async () => {
    const { service, request } = setup();

    const response = await request('/admin/notifications/10', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(service.deleteAdminNotification).toHaveBeenCalledWith(10);
  });

  it('未認証なら401を返す', async () => {
    const { service, request } = setup();

    const response = await request('/admin/notifications', {}, false);

    expect(response.status).toBe(401);
    expect(service.getAdminNotifications).not.toHaveBeenCalled();
  });

  it('staffsまたはteachersでなければ403を返す', async () => {
    const { service, request } = setup();
    (
      service.canManageAdminNotifications as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    const response = await request('/admin/notifications');

    expect(response.status).toBe(403);
    expect(service.getAdminNotifications).not.toHaveBeenCalled();
  });

  it.each([
    '/admin/notifications?sendStatus=canceled',
    '/admin/notifications?limit=101',
    '/admin/notifications?from=2026-07-24T00%3A00%3A00Z&to=2026-07-23T00%3A00%3A00Z',
  ])('不正な一覧条件%sは400を返す', async path => {
    const { service, request } = setup();

    const response = await request(path);

    expect(response.status).toBe(400);
    expect(service.getAdminNotifications).not.toHaveBeenCalled();
  });

  it('更新項目がなければ400を返す', async () => {
    const { service, request } = setup();

    const response = await request('/admin/notifications/10', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(service.updateAdminNotification).not.toHaveBeenCalled();
  });

  it.each([
    ['Admin notification not found', 404],
    ['Only fully draft notifications can be updated', 409],
    ['Notification audience has no active Firebase tokens', 409],
  ] as const)('%sをHTTP %sへ変換する', async (message, status) => {
    const { service, request } = setup();
    (
      service.updateAdminNotification as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error(message));

    const response = await request('/admin/notifications/10', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '変更後' }),
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  });
});
