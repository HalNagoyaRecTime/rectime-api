import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IFirebaseTokenService } from '../../../src/application/services/IFirebaseTokenService';
import type { RegisterFirebaseTokenResult } from '../../../src/domain/entities/FirebaseToken';
import type { Env } from '../../../src/lib/env';
import { createFirebaseTokenController } from '../../../src/presentation/controllers/FirebaseTokenController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

function setup(authenticatedUserId: number | null = 7) {
  const firebaseTokenService: IFirebaseTokenService = {
    registerFirebaseToken: vi.fn(),
  };
  const controller = createFirebaseTokenController(firebaseTokenService);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', authenticatedUserId);
    await next();
  });
  app.post('/firebase-tokens', c => controller.registerFirebaseToken(c));
  return { app, firebaseTokenService };
}

const result: RegisterFirebaseTokenResult = {
  firebase_token_id: 1,
  user_id: 7,
  platform: 'android',
  is_firebase_active: true,
  last_seen_at: '2026-07-24 00:00:00',
};

describe('FirebaseTokenController', () => {
  it('認証済みuserIdとAndroid TokenをServiceへ渡す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockResolvedValue(result);

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'fcm-abc',
        platform: 'android',
      }),
    });

    expect(firebaseTokenService.registerFirebaseToken).toHaveBeenCalledWith({
      userId: 7,
      platform: 'android',
      fcmToken: 'fcm-abc',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it('未認証の場合は401を返す', async () => {
    const { app, firebaseTokenService } = setup(null);

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'fcm-abc',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(401);
    expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { fcmToken: '', platform: 'android' },
    { fcmToken: 'fcm-abc', platform: 'ios' },
    { fcmToken: 'fcm-abc', platform: 2 },
    { fcmToken: 'fcm-abc', platform: 'android', userId: 999 },
    {
      fcmToken: 'fcm-abc',
      platform: 'android',
      studentNumber: 'S001',
    },
  ])('不正または余分な入力では400を返す: %o', async body => {
    const { app, firebaseTokenService } = setup();

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
  });

  it('不正なJSONでは400を返す', async () => {
    const { app, firebaseTokenService } = setup();

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid Firebase token request body',
    });
    expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
  });

  it('存在しない認証ユーザーには404を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('User not found'));

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'fcm-abc',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(404);
  });

  it('有効なToken重複には409を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error(
        "UNIQUE constraint failed: index 'idx_firebase_tokens_active_fcm_token'"
      )
    );

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'registered-token',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Firebase token is being registered by another request',
    });
  });

  it('D1でラップされたToken重複エラーにも409を返す', async () => {
    const { app, firebaseTokenService } = setup();
    const sqliteError = new Error(
      "UNIQUE constraint failed: index 'idx_firebase_tokens_active_fcm_token'"
    );
    const d1Error = new Error('D1_ERROR: constraint failed', {
      cause: sqliteError,
    });
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error('Failed query: update firebase_tokens', {
        cause: d1Error,
      })
    );

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'registered-token',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Firebase token is being registered by another request',
    });
  });

  it('別のUNIQUE制約違反には500を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error('UNIQUE constraint failed: firebase_tokens.user_id')
    );

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'fcm-abc',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to register Firebase token',
    });
  });

  it('想定外エラーでは機密値を含まない500を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('token=fcm-secret'));

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'fcm-secret',
        platform: 'android',
      }),
    });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('fcm-secret');
  });
});
