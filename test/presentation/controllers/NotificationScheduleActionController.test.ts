import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleActionController } from '../../../src/presentation/controllers/NotificationScheduleActionController';
import { NotificationScheduleActionError } from '../../../src/application/services/NotificationScheduleActionService';
import type { Env } from '../../../src/lib/env';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';

function harness(error?: Error, actor: number | null = 10) {
  const service = {
    resendSchedule: vi.fn(async () => {
      if (error) throw error;
      return { notificationId: 1, notificationScheduleId: 2 };
    }),
    cancelSchedule: vi.fn(async () => {
      if (error) throw error;
    }),
  };
  const controller = createNotificationScheduleActionController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: AuthenticationVariables & AuthVariables & ContainerVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', actor);
    await next();
  });
  app.post('/resend', c =>
    controller.resendSchedule(c, 1, {
      delivery: { type: 'immediate', sendAt: null },
    })
  );
  app.delete('/cancel', c => controller.cancelSchedule(c, 1));
  return { app, service };
}
describe('NotificationScheduleActionController', () => {
  it('再送201は共通ID Responseを返し認証UserをServiceへ渡す', async () => {
    const h = harness();
    const response = await h.app.request('/resend', { method: 'POST' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      notificationId: 1,
      notificationScheduleId: 2,
    });
    expect(h.service.resendSchedule).toHaveBeenCalledWith(1, 10, {
      delivery: { type: 'immediate', sendAt: null },
    });
  });
  it('取消はServiceを呼び204の空bodyを返す', async () => {
    const h = harness();
    const response = await h.app.request('/cancel', { method: 'DELETE' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(h.service.cancelSchedule).toHaveBeenCalledWith(1);
  });
  it.each([
    ['/resend', 'POST', 'NOTIFICATION_RESEND_NOT_ALLOWED', 409],
    ['/resend', 'POST', 'NOTIFICATION_SCHEDULE_NOT_FOUND', 404],
    ['/cancel', 'DELETE', 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED', 409],
    ['/cancel', 'DELETE', 'NOTIFICATION_SCHEDULE_NOT_FOUND', 404],
  ] as const)(
    '%sの%sに対する%sをHTTP契約へ変換する',
    async (path, method, code, status) => {
      const response = await harness(
        new NotificationScheduleActionError(code)
      ).app.request(path, { method });
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
  );
  it.each([
    ['/resend', 'POST'],
    ['/cancel', 'DELETE'],
  ])('%sは未認証時にServiceを呼ばない', async (path, method) => {
    const h = harness(undefined, null);
    expect((await h.app.request(path, { method })).status).toBe(401);
    expect(h.service.resendSchedule).not.toHaveBeenCalled();
    expect(h.service.cancelSchedule).not.toHaveBeenCalled();
  });
  it.each([
    ['/resend', 'POST'],
    ['/cancel', 'DELETE'],
  ])('%sのDB失敗を500にする', async (path, method) => {
    expect(
      (await harness(new Error('DB失敗')).app.request(path, { method })).status
    ).toBe(500);
  });
});
