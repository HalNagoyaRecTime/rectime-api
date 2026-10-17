import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createNotificationStopController } from '../../../src/presentation/controllers/NotificationStopController';
import { NotificationStopError } from '../../../src/application/services/NotificationStopService';
import type { Env } from '../../../src/lib/env';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';

function harness(error?: Error, actor: number | null = 10) {
  const stopSchedule = vi.fn(async () => {
    if (error) throw error;
    return { notificationScheduleId: 1, status: 'stopped' as const };
  });
  const controller = createNotificationStopController({ stopSchedule });
  const app = new Hono<{
    Bindings: Env;
    Variables: AuthenticationVariables & AuthVariables & ContainerVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', actor);
    await next();
  });
  app.post('/stop', c => controller.stopSchedule(c, 1));
  return { app, stopSchedule };
}
describe('NotificationStopController', () => {
  it('認証UserとmanualをServiceに渡し200の最小Responseを返す', async () => {
    const h = harness();
    const response = await h.app.request('/stop', {
      method: 'POST',
      body: JSON.stringify({ reason: 'source_deleted', stoppedByUserId: 999 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notificationScheduleId: 1,
      status: 'stopped',
    });
    expect(h.stopSchedule).toHaveBeenCalledWith({
      scheduleId: 1,
      reason: 'manual',
      stoppedByUserId: 10,
    });
  });
  it.each([
    ['NOTIFICATION_SCHEDULE_NOT_FOUND', 404],
    ['NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED', 409],
  ] as const)('%sをHTTP契約へ変換する', async (code, status) => {
    const response = await harness(new NotificationStopError(code)).app.request(
      '/stop',
      { method: 'POST' }
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
  it('未認証ではServiceを呼ばない', async () => {
    const h = harness(undefined, null);
    expect((await h.app.request('/stop', { method: 'POST' })).status).toBe(401);
    expect(h.stopSchedule).not.toHaveBeenCalled();
  });
  it('予期しない失敗を500にする', async () => {
    expect(
      (
        await harness(new Error('DB失敗')).app.request('/stop', {
          method: 'POST',
        })
      ).status
    ).toBe(500);
  });
});
