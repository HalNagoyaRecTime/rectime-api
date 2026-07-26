import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IMobileNotificationService } from '../../../src/application/services/IMobileNotificationService';
import { createMobileNotificationController } from '../../../src/presentation/controllers/MobileNotificationController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/sessionAuthentication';

const notification = {
  notification_id: 5,
  notification_type: 'event_reminder',
  title: '競技開始のお知らせ',
  body: '競技開始時間が近づいています。',
  scheduled_at: '2026-07-23T10:15:00+09:00',
  related_event: {
    event_id: 3,
    event_name: '綱引き',
    venue: 'グラウンド',
    start_time: '1030',
    end_time: '1100',
  },
};

function setup() {
  const service: IMobileNotificationService = {
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
  };
  const controller = createMobileNotificationController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Authorization') === 'Bearer valid-token' ? 12 : null
    );
    await next();
  });
  app.get('/me/notifications', c => controller.getNotifications(c));
  app.get('/me/notifications/:notificationId', c =>
    controller.getNotificationById(c)
  );
  const bindings = {} as Env;
  const authorizedRequest = (path: string) =>
    app.request(
      path,
      { headers: { Authorization: 'Bearer valid-token' } },
      bindings
    );
  return { app, service, bindings, authorizedRequest };
}

describe('MobileNotificationController', () => {
  it('本人宛ての通知一覧とページネーションを返す', async () => {
    const { service, authorizedRequest } = setup();
    (service.getNotifications as ReturnType<typeof vi.fn>).mockResolvedValue({
      notifications: [notification],
      total: 1,
      limit: 20,
      offset: 10,
    });

    const response = await authorizedRequest(
      '/me/notifications?limit=20&offset=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [notification],
      total: 1,
      limit: 20,
      offset: 10,
    });
    expect(service.getNotifications).toHaveBeenCalledWith(12, {
      limit: 20,
      offset: 10,
    });
  });

  it('一覧のlimitとoffsetにデフォルト値を使う', async () => {
    const { service, authorizedRequest } = setup();
    (service.getNotifications as ReturnType<typeof vi.fn>).mockResolvedValue({
      notifications: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const response = await authorizedRequest('/me/notifications');

    expect(response.status).toBe(200);
    expect(service.getNotifications).toHaveBeenCalledWith(12, {
      limit: 50,
      offset: 0,
    });
  });

  it.each([
    '/me/notifications?limit=0',
    '/me/notifications?limit=101',
    '/me/notifications?offset=-1',
  ])('不正な一覧条件%sは400を返す', async path => {
    const { service, authorizedRequest } = setup();

    const response = await authorizedRequest(path);

    expect(response.status).toBe(400);
    expect(service.getNotifications).not.toHaveBeenCalled();
  });

  it('本人宛ての通知詳細を返す', async () => {
    const { service, authorizedRequest } = setup();
    (service.getNotificationById as ReturnType<typeof vi.fn>).mockResolvedValue(
      notification
    );

    const response = await authorizedRequest('/me/notifications/5');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(notification);
    expect(service.getNotificationById).toHaveBeenCalledWith(5, 12);
  });

  it('本人宛てではない通知は404を返す', async () => {
    const { service, authorizedRequest } = setup();
    (service.getNotificationById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Notification not found')
    );

    const response = await authorizedRequest('/me/notifications/5');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Notification not found',
    });
  });

  it('不正な通知IDは400を返す', async () => {
    const { service, authorizedRequest } = setup();

    const response = await authorizedRequest('/me/notifications/invalid');

    expect(response.status).toBe(400);
    expect(service.getNotificationById).not.toHaveBeenCalled();
  });

  it.each(['/me/notifications', '/me/notifications/5'])(
    '未認証の%sは401を返す',
    async path => {
      const { app, service, bindings } = setup();

      const response = await app.request(path, {}, bindings);

      expect(response.status).toBe(401);
      expect(service.getNotifications).not.toHaveBeenCalled();
      expect(service.getNotificationById).not.toHaveBeenCalled();
    }
  );

  it('一覧取得の想定外エラーは500を返す', async () => {
    const { service, authorizedRequest } = setup();
    (service.getNotifications as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    const response = await authorizedRequest('/me/notifications');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to fetch notifications',
    });
  });
});
