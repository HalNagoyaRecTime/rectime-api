import { Hono } from 'hono';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { account } from '../../../../src/presentation/auth/routes/account';
import { signAccessToken } from '../../../../src/infrastructure/auth/jwt';
import type { MobileRefreshEntry } from '../../../../src/domain/auth/types';
import type { Env } from '../../../../src/lib/env';

const JWT_SECRET = 'a'.repeat(32);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

let privateKeyPem: string;

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey
  )) as ArrayBuffer;
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it('webはBearerトークンが無い場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/logout', { method: 'POST' }, buildEnv());

    expect(res.status).toBe(401);
  });

  it('webは有効なBearerトークンとrefresh_token_idを指定するとKVエントリを削除して成功する', async () => {
    const env = buildEnv();
    const token = await buildWebToken();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    await env.AUTH_KV.put('mobile_refresh_by_user:user-1', 'refresh-1');
    const app = buildApp();

    const res = await app.request(
      '/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Logged out successfully' });
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).toBeNull();
    expect(await env.AUTH_KV.get('mobile_refresh_by_user:user-1')).toBeNull();
  });
});

describe('POST /auth/refresh', () => {
  it('refresh_token_idが無い場合は400を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      buildEnv()
    );

    expect(res.status).toBe(400);
  });

  it('存在しないrefresh_token_idの場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token_id: 'unknown' }),
      },
      buildEnv()
    );

    expect(res.status).toBe(401);
  });

  it('webは有効なrefresh_token_idを指定すると新しいアクセストークンを発行しIDをローテーションする', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'graph-access-1',
          refresh_token: 'ms-refresh-2',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token_id: string;
      token_type: string;
      expires_in: number;
    };
    expect(body.token_type).toBe('Bearer');
    expect(body.refresh_token_id).not.toBe('refresh-1');
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).toBeNull();
    expect(
      await env.AUTH_KV.get(`mobile_refresh:${body.refresh_token_id}`)
    ).not.toBeNull();
  });

  it('Microsoftのリフレッシュに失敗した場合は401を返す', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('REFRESH_TOKEN_EXPIRED');
  });
});
