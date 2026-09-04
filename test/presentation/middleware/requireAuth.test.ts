import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  requireAuth,
  type AuthVariables,
} from '../../../src/presentation/middleware/requireAuth';
import {
  bearerAuthenticationMiddleware,
  type AuthenticationVariables,
} from '../../../src/presentation/middleware/bearerAuthentication';
import { signAccessToken } from '../../../src/infrastructure/auth/jwt';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { DIContainer } from '../../../src/di/container';
import type { Env } from '../../../src/lib/env';

type Variables = ContainerVariables & AuthenticationVariables & AuthVariables;

const JWT_SECRET = 'a'.repeat(32);

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env['DB'],
    AUTH_KV: createMockKv(),
    MASTER_IMPORT_COMMIT_LOCK: {} as Env['MASTER_IMPORT_COMMIT_LOCK'],
    NOTIFICATION_DELIVERY_QUEUE: {} as Env['NOTIFICATION_DELIVERY_QUEUE'],
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
    MICROSOFT_MOBILE_REDIRECT_URI: 'https://example.com/mobile-callback',
    FRONTEND_URL: 'https://example.com',
    JWT_SECRET,
    JWT_EXPIRES_SEC: '3600',
    MOBILE_REFRESH_EXPIRES_SEC: '2592000',
    STUDENT_EMAIL_DOMAIN: 'nhs.hal.ac.jp',
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

// 本番では diContainerMiddleware がコンテナを設定する。ここでは requireAuth が
// 実際に参照する userActivationRepository だけをスタブとして差し込み、
// D1に依存せずミドルウェア単体の分岐を検証する（実SQLの検証は
// UserActivationRepository.test.ts が実DBに対して行う）。
function useStubContainer(
  app: Hono<{ Bindings: Env; Variables: Variables }>,
  isActive: boolean
) {
  app.use('*', async (c, next) => {
    c.set('container', {
      userActivationRepository: { isActive: async () => isActive },
    } as unknown as DIContainer);
    await next();
  });
}

// D1が一時的に不調な状況を模す。
function useFailingContainer(
  app: Hono<{ Bindings: Env; Variables: Variables }>
) {
  app.use('*', async (c, next) => {
    c.set('container', {
      userActivationRepository: {
        isActive: async () => {
          throw new Error('D1_ERROR');
        },
      },
    } as unknown as DIContainer);
    await next();
  });
}

function buildApp(isActive = true) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  useStubContainer(app, isActive);
  app.use('*', bearerAuthenticationMiddleware);
  app.get('/protected', requireAuth, c => {
    return c.json({ authUser: c.get('authUser') });
  });
  return app;
}

describe('requireAuth', () => {
  describe('mobile (Bearer JWT)', () => {
    it('有効なJWTがあれば authUser を設定して次へ進む', async () => {
      const env = buildEnv();
      const token = await signAccessToken(
        {
          sub: '1',
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
          id: '1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
        },
      });
    });

    it('認証成功後にハンドラが例外を投げても401にはならない', async () => {
      const env = buildEnv();
      const token = await signAccessToken(
        {
          sub: '1',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'mobile',
        },
        JWT_SECRET,
        3600
      );
      const app = new Hono<{ Bindings: Env; Variables: Variables }>();
      useStubContainer(app, true);
      app.use('*', bearerAuthenticationMiddleware);
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
      const token = await signAccessToken(
        {
          sub: '1',
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

  describe('web (Bearer JWT)', () => {
    it('有効なJWTがあれば authUser を設定して次へ進む', async () => {
      const env = buildEnv();
      const token = await signAccessToken(
        {
          sub: '1',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'web',
        },
        JWT_SECRET,
        3600
      );
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        env
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        authUser: {
          id: '1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
        },
      });
    });

    it('Authorizationヘッダーが無い場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request('/protected', {}, buildEnv());

      expect(res.status).toBe(401);
    });

    it('不正なJWTの場合は401を返す', async () => {
      const app = buildApp();

      const res = await app.request(
        '/protected',
        { headers: { Authorization: 'Bearer not-a-valid-jwt' } },
        buildEnv()
      );

      expect(res.status).toBe(401);
    });

    it('mobile用に発行されたJWTをwebで使おうとすると401を返す', async () => {
      const env = buildEnv();
      const token = await signAccessToken(
        {
          sub: '1',
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
        { headers: { Authorization: `Bearer ${token}` } },
        env
      );

      expect(res.status).toBe(401);
    });

    it('認証成功後にハンドラが例外を投げても401にはならない', async () => {
      const env = buildEnv();
      const token = await signAccessToken(
        {
          sub: '1',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'web',
        },
        JWT_SECRET,
        3600
      );
      const app = new Hono<{ Bindings: Env; Variables: Variables }>();
      useStubContainer(app, true);
      app.use('*', bearerAuthenticationMiddleware);
      app.get('/protected', requireAuth, () => {
        throw new Error('downstream failure');
      });

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        env
      );

      expect(res.status).not.toBe(401);
    });
  });

  describe('無効化されたユーザー (#255)', () => {
    async function issueToken(): Promise<string> {
      return signAccessToken(
        {
          sub: '1',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'web',
        },
        JWT_SECRET,
        3600
      );
    }

    it('トークンが有効でも is_live_active が0なら401を返す', async () => {
      const token = await issueToken();
      const app = buildApp(false);

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        buildEnv()
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: {
          code: 'USER_DEACTIVATED',
          message: 'このアカウントは無効化されています',
        },
      });
    });

    it('無効化されている場合はハンドラを実行しない', async () => {
      const token = await issueToken();
      const handler = vi.fn(() => new Response('ok'));
      const app = new Hono<{ Bindings: Env; Variables: Variables }>();
      useStubContainer(app, false);
      app.use('*', bearerAuthenticationMiddleware);
      app.get('/protected', requireAuth, handler);

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        buildEnv()
      );

      expect(res.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('状態の確認に失敗した場合はアプリ標準形式の500を返し、ハンドラを実行しない', async () => {
      const token = await issueToken();
      const handler = vi.fn(() => new Response('ok'));
      const app = new Hono<{ Bindings: Env; Variables: Variables }>();
      useFailingContainer(app);
      app.use('*', bearerAuthenticationMiddleware);
      app.get('/protected', requireAuth, handler);

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        buildEnv()
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'USER_ACTIVATION_CHECK_FAILED',
          message: 'アカウント状態の確認に失敗しました',
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('subがユーザーIDとして解釈できないトークンは401を返す', async () => {
      // 状態を確認できない以上は通さない（フェイルクローズ）
      const token = await signAccessToken(
        {
          sub: 'not-a-number',
          oid: 'oid-1',
          email: 'tanaka@example.com',
          display_name: '田中太郎',
          client_type: 'web',
        },
        JWT_SECRET,
        3600
      );
      const app = buildApp(true);

      const res = await app.request(
        '/protected',
        { headers: { Authorization: `Bearer ${token}` } },
        buildEnv()
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      });
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
