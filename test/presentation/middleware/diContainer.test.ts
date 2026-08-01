import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from '../../../src/presentation/middleware/diContainer';
import type { Env } from '../../../src/lib/env';

function buildEnv(): Env {
  return {
    DB: {} as Env['DB'],
    AUTH_KV: {} as Env['AUTH_KV'],
    MASTER_IMPORT_KV: {} as Env['MASTER_IMPORT_KV'],
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
    MICROSOFT_REDIRECT_URI: 'https://example.com/callback',
    MICROSOFT_MOBILE_REDIRECT_URI: 'https://example.com/mobile-callback',
    FRONTEND_URL: 'https://example.com',
    SESSION_EXPIRES_SEC: '3600',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_SEC: '3600',
    MOBILE_REFRESH_EXPIRES_SEC: '2592000',
  };
}

describe('diContainerMiddleware', () => {
  it('リクエストごとに DI コンテナを生成し、context に設定する', async () => {
    const app = new Hono<{ Bindings: Env; Variables: ContainerVariables }>();
    app.use('*', diContainerMiddleware);
    app.get('/', c => {
      const container = c.get('container');
      return c.json({
        hasStudentController: Boolean(container.studentController),
        hasEventController: Boolean(container.eventController),
        hasAuthService: Boolean(container.authService),
      });
    });

    const res = await app.request('/', {}, buildEnv());

    expect(await res.json()).toEqual({
      hasStudentController: true,
      hasEventController: true,
      hasAuthService: true,
    });
  });
});
