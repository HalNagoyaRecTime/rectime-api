import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { DIContainer } from '../../../src/di/container';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import {
  sessionAuthenticationMiddleware,
  type AuthenticationVariables,
} from '../../../src/presentation/middleware/sessionAuthentication';

function setup(sessionUserId: string | null) {
  const getSession = vi.fn().mockResolvedValue(
    sessionUserId
      ? {
          user_id: sessionUserId,
          expires_at: '2099-01-01T00:00:00.000Z',
        }
      : null
  );
  const container = {
    authService: { getSession },
  } as unknown as DIContainer;
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('container', container);
    await next();
  });
  app.use('*', sessionAuthenticationMiddleware);
  app.get('/', c =>
    c.json({ authenticatedUserId: c.get('authenticatedUserId') })
  );
  return { app, getSession };
}

describe('sessionAuthenticationMiddleware', () => {
  it('セッションを復元して認証済みuserIdだけをContextへ設定する', async () => {
    const { app, getSession } = setup('7');

    const response = await app.request('/', {
      headers: { Cookie: 'session=session-id' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticatedUserId: 7 });
    expect(getSession).toHaveBeenCalledWith('session-id');
  });

  it('セッションがない場合はnullをContextへ設定する', async () => {
    const { app, getSession } = setup(null);

    const response = await app.request('/');

    expect(await response.json()).toEqual({ authenticatedUserId: null });
    expect(getSession).not.toHaveBeenCalled();
  });

  it('不正なuserIdのセッションは未認証として扱う', async () => {
    const { app } = setup('invalid');

    const response = await app.request('/', {
      headers: { Cookie: 'session=session-id' },
    });

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });
});
