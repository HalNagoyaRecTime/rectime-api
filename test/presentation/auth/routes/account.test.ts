import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { account } from '../../../../src/presentation/auth/routes/account';
import { verifyAccessToken } from '../../../../src/infrastructure/auth/jwt';
import { createSession } from '../../../../src/infrastructure/auth/session';
import type { Env } from '../../../../src/lib/env';
import type { Session } from '../../../../src/domain/auth/types';

const JWT_SECRET = 'a'.repeat(32);

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env['DB'],
    AUTH_KV: createMockKv(),
    ALLOWED_ORIGINS: '',
    FIREBASE_PROJECT_ID: 'project',
    FIREBASE_CLIENT_EMAIL: 'sa@example.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: 'dummy-key',
    TEST_FCM_TOKEN: 'test-token',
    MICROSOFT_CLIENT_ID: 'client-id',
    MICROSOFT_CLIENT_PRIVATE_KEY: 'dummy-key',
    MICROSOFT_CERT_THUMBPRINT: 'thumbprint',
    MICROSOFT_TENANT: 'common',
    ALLOWED_MICROSOFT_TENANTS: '',
    MICROSOFT_REDIRECT_URI: 'https://example.com/callback',
    MICROSOFT_MOBILE_REDIRECT_URI: 'https://example.com/mobile-callback',
    FRONTEND_URL: 'https://example.com',
    SESSION_EXPIRES_SEC: '3600',
    JWT_SECRET,
    JWT_EXPIRES_SEC: '3600',
    MOBILE_REFRESH_EXPIRES_SEC: '2592000',
    ...overrides,
  };
}

function createMockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    get: async (key: string) => store.get(key) ?? null,
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function buildSessionData(): Omit<Session, 'expires_at'> {
  return {
    user_id: 'user-1',
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
  };
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', account);
  return app;
}

describe('GET /auth/me', () => {
  it('webはCookieセッションを検証し、apiClient用のBearerアクセストークンも発行する', async () => {
    const env = buildEnv();
    const sessionId = await createSession(
      env.AUTH_KV,
      buildSessionData(),
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Cookie: `session=${sessionId}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      user?: { id: string; email: string; display_name: string };
    };

    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
    expect(body.user).toMatchObject({
      id: 'user-1',
      email: 'tanaka@example.com',
      display_name: '田中太郎',
    });

    expect(body.access_token).toBeTruthy();
    const claims = await verifyAccessToken(
      body.access_token as string,
      JWT_SECRET,
      'web'
    );
    expect(claims).toMatchObject({
      sub: 'sub-1',
      oid: 'oid-1',
      email: 'tanaka@example.com',
      display_name: '田中太郎',
      client_type: 'web',
    });
  });

  it('Cookieが無い場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/me', {}, buildEnv());

    expect(res.status).toBe(401);
  });
});
