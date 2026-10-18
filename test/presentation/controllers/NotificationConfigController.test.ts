import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  NotificationConfigError,
  type NotificationConfigService,
} from '../../../src/application/services/NotificationConfigService';
import type { Env } from '../../../src/lib/env';
import { createNotificationConfigController } from '../../../src/presentation/controllers/NotificationConfigController';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const config = {
  importance: {
    default: 'normal' as const,
    options: ['low', 'normal'] as const,
  },
};
const countBody = { audience: { items: [{ type: 'all' as const }] } };

function setup(
  service: NotificationConfigService,
  authenticatedUserId: number | null = 1
) {
  const controller = createNotificationConfigController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use(async (c, next) => {
    c.set('authenticatedUserId', authenticatedUserId);
    await next();
  });
  app.get('/config', c => controller.getConfig(c));
  app.post('/audience-count', c => controller.countAudience(c, countBody));
  return {
    get: () => app.request('/config', {}, {} as Env),
    post: () => app.request('/audience-count', { method: 'POST' }, {} as Env),
  };
}

function createService(
  countAudience: NotificationConfigService['countAudience']
): NotificationConfigService {
  return {
    getConfig: vi.fn().mockReturnValue({
      importance: { ...config.importance, options: ['low', 'normal'] },
    }),
    countAudience: vi.fn(countAudience),
  };
}

describe('NotificationConfigController', () => {
  it('configとaudience-countを200で返す', async () => {
    const service = createService(async () => ({ recipientCount: 42 }));
    const { get, post } = setup(service);

    const configResponse = await get();
    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toEqual(config);

    const countResponse = await post();
    expect(countResponse.status).toBe(200);
    expect(await countResponse.json()).toEqual({ recipientCount: 42 });
    expect(service.countAudience).toHaveBeenCalledWith(countBody);
  });

  it('対象が存在しない場合は共通Error envelopeの404を返す', async () => {
    const { post } = setup(
      createService(async () => {
        throw new NotificationConfigError('NOTIFICATION_AUDIENCE_NOT_FOUND');
      })
    );

    const response = await post();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_AUDIENCE_NOT_FOUND' },
    });
  });

  it('予期しないErrorは500を返す', async () => {
    const { post } = setup(
      createService(async () => {
        throw new Error('db down');
      })
    );

    expect((await post()).status).toBe(500);
  });

  it('認証Userがない場合は401を返す', async () => {
    const service = createService(async () => ({ recipientCount: 0 }));
    const { get, post } = setup(service, null);

    expect((await get()).status).toBe(401);
    expect((await post()).status).toBe(401);
    expect(service.countAudience).not.toHaveBeenCalled();
  });
});
