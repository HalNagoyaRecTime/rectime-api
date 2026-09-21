import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { INotificationStopService } from '../../../src/application/services/INotificationStopService';
import { createNotificationStopController } from '../../../src/presentation/controllers/NotificationStopController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

function setup(
  result: Awaited<ReturnType<INotificationStopService['stopSchedule']>> = {
    notificationScheduleId: 496,
    status: 'stopped',
  }
) {
  const service: INotificationStopService = {
    stopSchedule: vi.fn().mockResolvedValue(result),
  };
  const controller = createNotificationStopController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie')?.includes('session=session-id') ? 12 : null
    );
    await next();
  });
  app.post('/admin/notifications/schedules/:notificationScheduleId/stop', c =>
    controller.stopSchedule(c)
  );
  const request = (path: string, authenticated = true) =>
    app.request(
      path,
      {
        method: 'POST',
        headers: authenticated ? { Cookie: 'session=session-id' } : {},
      },
      {} as Env
    );
  return { service, request };
}

describe('NotificationStopController', () => {
  it('認証Userをmanual Stopへ渡し、契約どおり返す', async () => {
    const { service, request } = setup();

    const response = await request('/admin/notifications/schedules/496/stop');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notificationScheduleId: 496,
      status: 'stopped',
    });
    expect(service.stopSchedule).toHaveBeenCalledWith({
      scheduleId: 496,
      stoppedByUserId: 12,
      reason: 'manual',
    });
  });

  it('未認証は401でServiceを呼ばない', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/notifications/schedules/496/stop',
      false
    );

    expect(response.status).toBe(401);
    expect(service.stopSchedule).not.toHaveBeenCalled();
  });

  it('存在しないScheduleは404', async () => {
    const { request } = setup({
      notificationScheduleId: 496,
      status: 'not_found',
    });

    const response = await request('/admin/notifications/schedules/496/stop');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' },
    });
  });

  it('sending以外のScheduleは409', async () => {
    const { request } = setup({
      notificationScheduleId: 496,
      status: 'not_allowed',
    });

    const response = await request('/admin/notifications/schedules/496/stop');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED' },
    });
  });
});
