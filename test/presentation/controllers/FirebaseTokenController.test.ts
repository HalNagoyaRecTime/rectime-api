import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

// 409/500 の判定はSQLiteが返すエラー文へ依存する。文字列を手で組み立てると
// スキーマ変更でメッセージ形式が変わったことを検出できないため、実際のDBで
// 制約違反を起こして本物のエラーを取得する。
async function createUser(userName: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  if (!row) throw new Error('failed to create test user');
  return row.user_id;
}

async function insertActiveToken(
  userId: number,
  fcmToken: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active)
     VALUES (?, 2, ?, 1)`
  )
    .bind(userId, fcmToken)
    .run();
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('制約違反が発生しなかった');
}

async function captureDuplicateFcmTokenError(): Promise<unknown> {
  const ownerId = await createUser('Firebaseコントローラ確認所有者');
  const otherId = await createUser('Firebaseコントローラ確認別利用者');
  await insertActiveToken(ownerId, 'controller-duplicate-token');
  return captureError(() =>
    insertActiveToken(otherId, 'controller-duplicate-token')
  );
}

async function captureDuplicateUserIdError(): Promise<unknown> {
  const userId = await createUser('Firebaseコントローラ確認重複利用者');
  await insertActiveToken(userId, 'controller-first-token');
  return captureError(() =>
    insertActiveToken(userId, 'controller-second-token')
  );
}

const result: RegisterFirebaseTokenResult = {
  firebase_token_id: 1,
  user_id: 7,
  platform: 'android',
  is_firebase_active: true,
  last_seen_at: '2026-07-24 00:00:00',
};

describe('FirebaseTokenController', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM firebase_tokens WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE 'Firebaseコントローラ確認%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE 'Firebaseコントローラ確認%'"
    ).run();
  });

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

  it('iOS TokenをServiceへ渡す', async () => {
    const { app, firebaseTokenService } = setup();
    const iosResult = { ...result, platform: 'ios' as const };
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockResolvedValue(iosResult);

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcmToken: 'ios-fcm-token',
        platform: 'ios',
      }),
    });

    expect(firebaseTokenService.registerFirebaseToken).toHaveBeenCalledWith({
      userId: 7,
      platform: 'ios',
      fcmToken: 'ios-fcm-token',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(iosResult);
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
    { fcmToken: 'fcm-abc', platform: 'windows' },
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
      error: expect.objectContaining({
        code: 'INVALID_FIREBASE_TOKEN_REQUEST',
      }),
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

  it('実際のDBで発生した有効なToken重複には409を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(await captureDuplicateFcmTokenError());

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
      error: expect.objectContaining({
        code: 'FIREBASE_TOKEN_REGISTRATION_CONFLICT',
      }),
    });
  });

  it('D1でラップされたToken重複エラーにも409を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new Error('Failed query: update firebase_tokens', {
        cause: await captureDuplicateFcmTokenError(),
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
      error: expect.objectContaining({
        code: 'FIREBASE_TOKEN_REGISTRATION_CONFLICT',
      }),
    });
  });

  it('実際のDBで発生した別のUNIQUE制約違反には500を返す', async () => {
    const { app, firebaseTokenService } = setup();
    (
      firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(await captureDuplicateUserIdError());

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
      error: expect.objectContaining({
        code: 'FIREBASE_TOKEN_REGISTRATION_FAILED',
      }),
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
