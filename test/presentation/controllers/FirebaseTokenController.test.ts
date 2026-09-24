import { describe, expect, it, vi } from 'vitest';
import type { IFirebaseTokenService } from '../../../src/application/services/IFirebaseTokenService';
import type { Env } from '../../../src/lib/env';
import { createFirebaseTokenController } from '../../../src/presentation/controllers/FirebaseTokenController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';
import { Hono } from 'hono';

const firebaseTokenDTO = {
  firebaseTokenId: 3,
  userId: 7,
  platform: 'android' as const,
  lastSeenAt: '2026-09-24T01:02:03.000Z',
};

function setup(authenticatedUserId: number | null = 7) {
  const firebaseTokenService: IFirebaseTokenService = {
    registerFirebaseToken: vi.fn().mockResolvedValue(firebaseTokenDTO),
    deleteFirebaseToken: vi.fn().mockResolvedValue('deleted'),
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
  app.delete('/firebase-tokens/:firebaseTokenId', c =>
    controller.deleteFirebaseToken(c)
  );
  return { app, firebaseTokenService };
}

describe('FirebaseTokenController', () => {
  it('#452のFirebaseTokenDTOを返す', async () => {
    const { app, firebaseTokenService } = setup();
    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken: 'fcm-abc', platform: 'android' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(firebaseTokenDTO);
    expect(firebaseTokenService.registerFirebaseToken).toHaveBeenCalledWith({
      userId: 7,
      fcmToken: 'fcm-abc',
      platform: 'android',
    });
  });

  it('未認証のPOSTは401を返す', async () => {
    const { app, firebaseTokenService } = setup(null);
    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken: 'fcm-abc', platform: 'android' }),
    });

    expect(response.status).toBe(401);
    expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
  });

  it.each([
    '{',
    JSON.stringify({}),
    JSON.stringify({ fcmToken: '', platform: 'android' }),
    JSON.stringify({ fcmToken: 'fcm-abc', platform: 'windows' }),
  ])('不正なPOST入力はVALIDATION_ERRORを返す: %s', async body => {
    const { app, firebaseTokenService } = setup();
    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
  });

  it('想定外のPOSTエラーにTokenを含めない', async () => {
    const { app, firebaseTokenService } = setup();
    vi.mocked(firebaseTokenService.registerFirebaseToken).mockRejectedValue(
      new Error('token=fcm-secret')
    );

    const response = await app.request('/firebase-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcmToken: 'fcm-secret', platform: 'android' }),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('fcm-secret');
  });

  it('DELETEは所有者のTokenを物理削除して204を返す', async () => {
    const { app, firebaseTokenService } = setup();
    const response = await app.request('/firebase-tokens/3', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(firebaseTokenService.deleteFirebaseToken).toHaveBeenCalledWith(3, 7);
  });

  it('未認証のDELETEは401を返す', async () => {
    const { app, firebaseTokenService } = setup(null);
    const response = await app.request('/firebase-tokens/3', {
      method: 'DELETE',
    });

    expect(response.status).toBe(401);
    expect(firebaseTokenService.deleteFirebaseToken).not.toHaveBeenCalled();
  });

  it('不正なToken IDは400を返す', async () => {
    const { app, firebaseTokenService } = setup();
    const response = await app.request('/firebase-tokens/0', {
      method: 'DELETE',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(firebaseTokenService.deleteFirebaseToken).not.toHaveBeenCalled();
  });

  it('他ユーザーのTokenは403を返す', async () => {
    const { app, firebaseTokenService } = setup();
    vi.mocked(firebaseTokenService.deleteFirebaseToken).mockResolvedValue(
      'forbidden'
    );

    const response = await app.request('/firebase-tokens/3', {
      method: 'DELETE',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FIREBASE_TOKEN_FORBIDDEN' },
    });
  });

  it('存在しないTokenは404を返す', async () => {
    const { app, firebaseTokenService } = setup();
    vi.mocked(firebaseTokenService.deleteFirebaseToken).mockResolvedValue(
      'not_found'
    );

    const response = await app.request('/firebase-tokens/999', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'FIREBASE_TOKEN_NOT_FOUND' },
    });
  });

  it('DELETEの内部エラーで詳細を返さない', async () => {
    const { app, firebaseTokenService } = setup();
    vi.mocked(firebaseTokenService.deleteFirebaseToken).mockRejectedValue(
      new Error('database detail')
    );

    const response = await app.request('/firebase-tokens/3', {
      method: 'DELETE',
    });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('database detail');
  });
});
