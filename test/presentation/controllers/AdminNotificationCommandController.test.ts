import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminNotificationDetailDTO,
  NotificationCreateRequestDTO,
  NotificationPatchRequestDTO,
} from '../../../src/application/dto/AdminNotificationDTO';
import { AdminNotificationCommandError } from '../../../src/application/services/AdminNotificationCommandService';
import type { Env } from '../../../src/lib/env';
import { createAdminNotificationCommandController } from '../../../src/presentation/controllers/AdminNotificationCommandController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const createRequest: NotificationCreateRequestDTO = {
  content: {
    push: { title: 'Push title', body: 'Push body' },
    detail: { title: 'Detail title', body: 'Detail body' },
  },
  audience: { items: [{ type: 'all' }] },
  delivery: { type: 'immediate', sendAt: null },
  importance: 'normal',
};

const detail: AdminNotificationDetailDTO = {
  notificationId: 10,
  content: createRequest.content,
  importance: 'normal',
  creation: { method: 'manual', user: null, source: null },
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
  schedules: [],
};

function setup(authenticated = true) {
  const service = {
    createNotification: vi.fn().mockResolvedValue({
      notificationId: 10,
      notificationScheduleId: 11,
    }),
    patchNotification: vi.fn().mockResolvedValue(detail),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
  };
  const controller = createAdminNotificationCommandController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', authenticated ? 3 : null);
    await next();
  });
  app.post('/admin/notifications', c =>
    controller.createNotification(c, createRequest)
  );
  app.patch('/admin/notifications/:notificationId', c =>
    controller.patchNotification(c, Number(c.req.param('notificationId')), {
      content: { detail: { title: '更新Detail' } },
    })
  );
  app.delete('/admin/notifications/:notificationId', c =>
    controller.deleteNotification(c, Number(c.req.param('notificationId')))
  );
  return { app, service };
}

describe('AdminNotificationCommandController', () => {
  it('認証Userを作成者として渡し、201を返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createRequest),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      notificationId: 10,
      notificationScheduleId: 11,
    });
    expect(service.createNotification).toHaveBeenCalledWith(3, createRequest);
  });

  it('PATCHの詳細Responseと数値IDを返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/admin/notifications/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { detail: { title: '更新Detail' } } }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(service.patchNotification).toHaveBeenCalledWith(10, {
      content: { detail: { title: '更新Detail' } },
    } satisfies NotificationPatchRequestDTO);
  });

  it('PATCHの業務エラーを契約済み409へ変換する', async () => {
    const { app, service } = setup();
    vi.mocked(service.patchNotification).mockRejectedValue(
      new AdminNotificationCommandError('NOTIFICATION_EDIT_NOT_ALLOWED')
    );

    const response = await app.request('/admin/notifications/10', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { detail: { title: '更新Detail' } } }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_EDIT_NOT_ALLOWED' },
    });
  });

  it('DELETE成功時は204を返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/admin/notifications/10', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(service.deleteNotification).toHaveBeenCalledWith(10);
  });

  it.each(['POST', 'PATCH', 'DELETE'] as const)(
    '%sは未認証なら401にし、Serviceを呼ばない',
    async method => {
      const { app, service } = setup(false);
      const response = await app.request(
        method === 'POST' ? '/admin/notifications' : '/admin/notifications/10',
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(method === 'DELETE'
            ? {}
            : { body: JSON.stringify(createRequest) }),
        }
      );

      expect(response.status).toBe(401);
      expect(service.createNotification).not.toHaveBeenCalled();
      expect(service.patchNotification).not.toHaveBeenCalled();
      expect(service.deleteNotification).not.toHaveBeenCalled();
    }
  );
});
