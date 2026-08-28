import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { requireStaff } from '../../../src/presentation/middleware/requireStaff';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';
import type { Env } from '../../../src/lib/env';
import type { DIContainer } from '../../../src/di/container';

type Variables = ContainerVariables & AuthenticationVariables & AuthVariables;

function buildApp(isStaff: ReturnType<typeof vi.fn>, userId: number | null) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', userId);
    c.set('container', {
      authorizationService: { isStaff },
    } as unknown as DIContainer);
    await next();
  });
  app.get('/staff-only', requireStaff, c => c.json({ ok: true }));
  return app;
}

describe('requireStaff', () => {
  it('staff権限があれば次へ進む', async () => {
    const isStaff = vi.fn().mockResolvedValue(true);
    const app = buildApp(isStaff, 1);

    const res = await app.request('/staff-only');

    expect(res.status).toBe(200);
    expect(isStaff).toHaveBeenCalledWith(1);
  });

  it('未認証の場合は401を返す', async () => {
    const isStaff = vi.fn();
    const app = buildApp(isStaff, null);

    const res = await app.request('/staff-only');

    expect(res.status).toBe(401);
    expect(isStaff).not.toHaveBeenCalled();
  });

  it('staff権限がなければ403 STAFF_REQUIREDを返す', async () => {
    const isStaff = vi.fn().mockResolvedValue(false);
    const app = buildApp(isStaff, 1);

    const res = await app.request('/staff-only');

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'STAFF_REQUIRED', message: 'staff権限が必要です' },
    });
  });

  it('staff判定でエラーが起きた場合は500を返す', async () => {
    const isStaff = vi.fn().mockRejectedValue(new Error('D1 error'));
    const app = buildApp(isStaff, 1);

    const res = await app.request('/staff-only');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'staff権限の確認に失敗しました',
      },
    });
  });
});
