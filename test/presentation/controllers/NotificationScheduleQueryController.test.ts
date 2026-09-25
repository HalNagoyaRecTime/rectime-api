import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationScheduleDetailDTO } from '../../../src/application/dto/NotificationScheduleDTO';
import type { INotificationScheduleQueryService } from '../../../src/application/services/INotificationScheduleQueryService';
import type { Env } from '../../../src/lib/env';
import { createNotificationScheduleQueryController } from '../../../src/presentation/controllers/NotificationScheduleQueryController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const detail: NotificationScheduleDetailDTO = {
  notificationId: 41,
  notificationScheduleId: 61,
  content: { push: { title: 'Push title', body: 'Push body' } },
  importance: 'normal',
  sendAt: '2026-07-23T02:00:00.000Z',
  status: 'sending',
  stop: null,
  creation: { method: 'manual', user: null, source: null },
  audienceProgress: { totalCount: 0, resolvedCount: 0 },
  recipientProgress: { count: 2, status: 'pending' },
  deliveryProgress: {
    totalCount: 3,
    pendingCount: 0,
    sendingCount: 0,
    retryWaitCount: 1,
    sentCount: 1,
    failedCount: 1,
    stoppedCount: 0,
  },
};

function setup() {
  const service: INotificationScheduleQueryService = {
    getNotificationSchedules: vi.fn().mockResolvedValue({ items: [] }),
    getNotificationScheduleById: vi.fn().mockResolvedValue(detail),
  };
  const controller = createNotificationScheduleQueryController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.get('/admin/notifications/schedules', c =>
    controller.getNotificationSchedules(c)
  );
  app.get('/admin/notifications/schedules/:notificationScheduleId', c =>
    controller.getNotificationScheduleById(c)
  );
  const request = (path: string) => app.request(path, {}, {} as Env);
  return { service, request };
}

describe('NotificationScheduleQueryController', () => {
  it('一覧のfrom/toを受け付ける', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/notifications/schedules?from=2026-07-23T00%3A00%3A00Z&to=2026-07-23T23%3A59%3A59Z'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
    expect(service.getNotificationSchedules).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });
  });

  it('片側だけの期間指定は400 VALIDATION_ERROR', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/notifications/schedules?to=2026-07-23T23%3A59%3A59Z'
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.getNotificationSchedules).not.toHaveBeenCalled();
  });

  it('詳細を返し、存在しないScheduleを404にする', async () => {
    const { service, request } = setup();
    const response = await request('/admin/notifications/schedules/61');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(service.getNotificationScheduleById).toHaveBeenCalledWith(61);

    vi.mocked(service.getNotificationScheduleById).mockResolvedValueOnce(null);
    const missing = await request('/admin/notifications/schedules/62');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' },
    });
  });
});
