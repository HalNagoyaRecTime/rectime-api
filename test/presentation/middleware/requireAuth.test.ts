import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  requireAuth,
  type AuthVariables,
} from '../../../src/presentation/middleware/requireAuth';
import { signMobileJwt } from '../../../src/infrastructure/auth/jwt';
import { createSession } from '../../../src/infrastructure/auth/session';
import type { Env } from '../../../src/lib/env';
import type { Session } from '../../../src/domain/auth/types';

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
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
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
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.get('/protected', requireAuth, c => {
    return c.json({ authUser: c.get('authUser') });
  });
  return app;
}

describe('requireAuth', () => {
  describe('web (session cookie)', () => {
    it('有効なセッションCookieがあれば authUser を設定して次へ進む', async () => {
      const env = buildEnv();
      const sessionId = await createSession(
        env.AUTH_KV,
        buildSessionData(),
        3600
      );
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { Cookie: `session=${sessionId}` } },
        env
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        authUser: {
          id: 'user-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
        },
      });
    });

    it('Cookieが無い場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request('/protected', {}, buildEnv());

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      });
    });

    it('存在しないセッションIDの場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { Cookie: 'session=unknown' } },
        buildEnv()
      );

      expect(res.status).toBe(401);
    });
  });

  describe('mobile (Bearer JWT)', () => {
    it('有効なJWTがあれば authUser を設定して次へ進む', async () => {
      const env = buildEnv();
      const token = await signMobileJwt(
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
        '/protected',
        {
          headers: {
            'X-Client-Type': 'mobile',
            Authorization: `Bearer ${token}`,
          },
        },
        env
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        authUser: {
          id: 'user-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
        },
      });
    });

    it('認証成功後にハンドラが例外を投げても401にはならない', async () => {
      const env = buildEnv();
      const token = await signMobileJwt(
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
      const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
      app.get('/protected', requireAuth, () => {
        throw new Error('downstream failure');
      });

      const res = await app.request(
        '/protected',
        {
          headers: {
            'X-Client-Type': 'mobile',
            Authorization: `Bearer ${token}`,
          },
        },
        env
      );

      expect(res.status).not.toBe(401);
    });

    it('Authorizationヘッダーが無い場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { 'X-Client-Type': 'mobile' } },
        buildEnv()
      );

      expect(res.status).toBe(401);
    });

    it('不正なJWTの場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request(
        '/protected',
        {
          headers: {
            'X-Client-Type': 'mobile',
            Authorization: 'Bearer not-a-valid-jwt',
          },
        },
        buildEnv()
      );

      expect(res.status).toBe(401);
    });

    it('期限切れのJWTの場合は401を返す', async () => {
      const env = buildEnv();
      const token = await signMobileJwt(
        {
          sub: 'user-1',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'mobile',
        },
        JWT_SECRET,
        -1
      );
      const app = buildApp();

      const res = await app.request(
        '/protected',
        {
          headers: {
            'X-Client-Type': 'mobile',
            Authorization: `Bearer ${token}`,
          },
        },
        env
      );

      expect(res.status).toBe(401);
    });
  });

  describe('不正な X-Client-Type', () => {
    it('web/mobile 以外の値の場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { 'X-Client-Type': 'bogus' } },
        buildEnv()
      );

      expect(res.status).toBe(401);
    });
  });
});
