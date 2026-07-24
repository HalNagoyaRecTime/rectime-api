import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { account } from '../../../../src/presentation/auth/routes/account';
import { signAccessToken } from '../../../../src/infrastructure/auth/jwt';
import type { Env } from '../../../../src/lib/env';

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

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', account);
  return app;
}

async function buildWebToken(): Promise<string> {
  return signAccessToken(
    {
      sub: 'user-1',
      oid: 'oid-1',
      email: 'tanaka@example.com',
      display_name: '田中太郎',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

describe('GET /auth/me', () => {
  it('webは有効なBearerトークンがあればユーザー情報のみを返す', async () => {
    const env = buildEnv();
    const token = await buildWebToken();
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token?: string;
      user?: { id: string; email: string; display_name: string };
    };

    expect(body.access_token).toBeUndefined();
    expect(body.user).toMatchObject({
      id: 'user-1',
      email: 'tanaka@example.com',
      display_name: '田中太郎',
    });
  });

  it('Authorizationヘッダーが無い場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/me', {}, buildEnv());

    expect(res.status).toBe(401);
  });

  it('mobile用に発行されたトークンをwebで使おうとすると401を返す', async () => {
    const env = buildEnv();
    const token = await signAccessToken(
      {
        sub: 'user-1',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'mobile',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('webはBearerトークンが無くても常に成功する(サーバー側で破棄するセッションが無いため)', async () => {
    const app = buildApp();

    const res = await app.request('/logout', { method: 'POST' }, buildEnv());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Logged out successfully' });
  });
});

describe('POST /auth/refresh', () => {
  it('webは常にREFRESH_NOT_SUPPORTEDで401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/refresh', { method: 'POST' }, buildEnv());

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('REFRESH_NOT_SUPPORTED');
  });
});
