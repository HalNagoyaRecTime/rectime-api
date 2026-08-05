import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { bearerAuthenticationMiddleware } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import { signAccessToken } from '../../../src/infrastructure/auth/jwt';
import type { Env } from '../../../src/lib/env';

const JWT_SECRET = 'a'.repeat(32);

function buildEnv(overrides: Partial<Env> = {}): Partial<Env> {
  return { JWT_SECRET, ...overrides };
}

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: AuthenticationVariables }>();
  app.use('*', bearerAuthenticationMiddleware);
  app.get('/', c =>
    c.json({ authenticatedUserId: c.get('authenticatedUserId') })
  );
  return app;
}

describe('bearerAuthenticationMiddleware', () => {
  it('有効なBearerトークンがあれば認証済みuserIdをContextへ設定する', async () => {
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticatedUserId: 7 });
  });

  it('Authorizationヘッダーが無い場合はnullをContextへ設定する', async () => {
    const app = buildApp();

    const response = await app.request('/', {}, buildEnv());

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('不正なBearerトークンの場合はnullとして扱う', async () => {
    const app = buildApp();

    const response = await app.request(
      '/',
      { headers: { Authorization: 'Bearer not-a-valid-jwt' } },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('X-Client-Typeが不正な値の場合はnullとして扱う', async () => {
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-Type': 'bogus',
        },
      },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });
});
