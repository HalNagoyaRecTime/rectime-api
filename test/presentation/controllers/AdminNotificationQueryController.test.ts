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
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
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
      '/admin/notifications?from=2026-09-24T00%3A00%3A00Z&to=2026-09-24T23%3A59%3A59Z'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(service.getAdminNotifications).toHaveBeenCalledWith({
      from: '2026-09-24T00:00:00Z',
      to: '2026-09-24T23:59:59Z',
    });
  });

  it.each([
    ['/admin/notifications?page=-1', '負のページ'],
    ['/admin/notifications?limit=0', 'limitが0'],
    ['/admin/notifications?limit=10000', 'limit超過'],
    ['/admin/notifications?limit=abc', 'limitが数値以外'],
    ['/admin/notifications?search=test', 'ページ指定のない絞り込み'],
    ['/admin/notifications?page=1&status=unknown', '不正な状態'],
    ['/admin/notifications?page=1&sortBy=title', '方向のない並べ替え'],
    [
      '/admin/notifications?page=1&referenceTime=2026-01-01T00%3A00%3A00Z',
      '並べ替えのない基準時刻',
    ],
    [
      '/admin/notifications?page=1&sortBy=unknown&sortDirection=asc',
      '不正な並べ替え',
    ],
    ['/admin/notifications?from=2026-09-24T00%3A00%3A00Z', 'fromだけ'],
    ['/admin/notifications?to=2026-09-24T23%3A59%3A59Z', 'toだけ'],
    [
      '/admin/notifications?from=2026-09-25T00%3A00%3A00Z&to=2026-09-24T23%3A59%3A59Z',
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

  it('ページ条件を数値としてServiceに渡す', async () => {
    const { service, request } = setup();
    const response = await request('/admin/notifications?page=2&limit=25');
    expect(response.status).toBe(200);
    expect(service.getAdminNotifications).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
    });
  });

  it('絞り込みと並べ替えを検証してServiceに渡す', async () => {
    const { service, request } = setup();
    const response = await request(
      '/admin/notifications?page=1&search=needle&status=failed&creationMethod=manual&sortBy=title&sortDirection=asc'
    );
    expect(response.status).toBe(200);
    expect(service.getAdminNotifications).toHaveBeenCalledWith({
      page: 1,
      search: 'needle',
      status: 'failed',
      creationMethod: 'manual',
      sortBy: 'title',
      sortDirection: 'asc',
    });
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

  it('詳細のNotification IDはsafe integer範囲を超えると400にし、Serviceを呼ばない', async () => {
    const { service, request } = setup();

    const safeResponse = await request(
      `/admin/notifications/${Number.MAX_SAFE_INTEGER}`
    );
    expect(safeResponse.status).toBe(200);
    expect(service.getAdminNotificationById).toHaveBeenCalledWith(
      Number.MAX_SAFE_INTEGER
    );

    for (const notificationId of [
      String(Number.MAX_SAFE_INTEGER + 1),
      '9'.repeat(100),
    ]) {
      const response = await request(`/admin/notifications/${notificationId}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    }

    expect(service.getAdminNotificationById).toHaveBeenCalledTimes(1);
  });
});
