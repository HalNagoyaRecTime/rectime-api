import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AdminNotificationDetailDTO } from '../../../src/application/dto/AdminNotificationDTO';
import type { IAdminNotificationQueryService } from '../../../src/application/services/IAdminNotificationQueryService';
import type { Env } from '../../../src/lib/env';
import { createAdminNotificationQueryController } from '../../../src/presentation/controllers/AdminNotificationQueryController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const detail: AdminNotificationDetailDTO = {
  notificationId: 10,
  content: {
    push: { title: 'Push title', body: 'Push body' },
    detail: { title: 'Detail title', body: 'Detail body' },
  },
  importance: 'normal',
  creation: { method: 'manual', user: null, source: null },
  createdAt: '2026-07-23T01:00:00.000Z',
  updatedAt: '2026-07-23T01:00:00.000Z',
  schedules: [],
};

function setup() {
  const service: IAdminNotificationQueryService = {
    getAdminNotifications: vi.fn().mockResolvedValue({ items: [] }),
    getAdminNotificationById: vi.fn().mockResolvedValue(detail),
  };
  const controller = createAdminNotificationQueryController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.get('/admin/notifications', c => controller.getAdminNotifications(c));
  app.get('/admin/notifications/:notificationId', c =>
    controller.getAdminNotificationById(c)
  );
  const request = (path: string) => app.request(path, {}, {} as Env);
  return { service, request };
}

describe('AdminNotificationQueryController', () => {
  it('一覧で期間条件を渡し、items responseを返す', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/notifications?from=2026-07-23T00%3A00%3A00Z&to=2026-07-23T23%3A59%3A59Z'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(service.getAdminNotifications).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });
  });

  it.each([
    ['/admin/notifications?from=2026-07-23T00%3A00%3A00Z', 'fromだけ'],
    [
      '/admin/notifications?from=2026-07-24T00%3A00%3A00Z&to=2026-07-23T00%3A00%3A00Z',
      'fromがtoより後',
    ],
  ])('%s は400 VALIDATION_ERROR (%s)', async path => {
    const { service, request } = setup();

    const response = await request(path);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.getAdminNotifications).not.toHaveBeenCalled();
  });

  it('詳細を返し、存在しない通知を404にする', async () => {
    const { service, request } = setup();
    const response = await request('/admin/notifications/10');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(service.getAdminNotificationById).toHaveBeenCalledWith(10);

    vi.mocked(service.getAdminNotificationById).mockResolvedValueOnce(null);
    const missingResponse = await request('/admin/notifications/11');
    expect(missingResponse.status).toBe(404);
    expect(await missingResponse.json()).toMatchObject({
      error: { code: 'ADMIN_NOTIFICATION_NOT_FOUND' },
    });
  });
});
