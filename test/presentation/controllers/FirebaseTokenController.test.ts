import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createFirebaseTokenController } from '../../../src/presentation/controllers/FirebaseTokenController';
import type { IFirebaseTokenService } from '../../../src/application/services/IFirebaseTokenService';
import type {
  RegisterFirebaseTokenResult,
  UserEntity,
  FirebaseTokenEntity,
} from '../../../src/domain/entities/FirebaseToken';

function buildUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    user_id: 1,
    user_name: 'テスト生徒',
    is_live_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function buildFirebaseToken(
  overrides: Partial<FirebaseTokenEntity> = {}
): FirebaseTokenEntity {
  return {
    firebase_token_id: 1,
    user_id: 1,
    platform: 2,
    fcm_token: 'token-a',
    is_firebase_active: 1,
    last_seen_at: '2026-01-01',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function buildResult(
  overrides: Partial<RegisterFirebaseTokenResult> = {}
): RegisterFirebaseTokenResult {
  return {
    user: buildUser(),
    firebaseToken: buildFirebaseToken(),
    ...overrides,
  };
}

function setup() {
  const firebaseTokenService: IFirebaseTokenService = {
    registerFirebaseToken: vi.fn(),
  };
  const controller = createFirebaseTokenController(firebaseTokenService);
  const app = new Hono();
  app.post('/firebase-tokens', c => controller.registerFirebaseToken(c));
  return { app, firebaseTokenService };
}

describe('FirebaseTokenController', () => {
  describe('registerFirebaseToken', () => {
    it('fcmToken フィールドを使った有効なボディでサービスを呼び出し 200 を返す', async () => {
      const { app, firebaseTokenService } = setup();
      const result = buildResult();
      (
        firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 2,
          fcmToken: 'fcm-abc',
        }),
      });

      expect(firebaseTokenService.registerFirebaseToken).toHaveBeenCalledWith({
        studentNumber: 'S001',
        platform: 2,
        fcmToken: 'fcm-abc',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
    });

    it('token フィールドを使った有効なボディでも fcmToken として渡す', async () => {
      const { app, firebaseTokenService } = setup();
      const result = buildResult();
      (
        firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 1,
          token: 'legacy-token',
        }),
      });

      expect(firebaseTokenService.registerFirebaseToken).toHaveBeenCalledWith({
        studentNumber: 'S001',
        platform: 1,
        fcmToken: 'legacy-token',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
    });

    it('fcmToken も token も無い場合は 400 を返す', async () => {
      const { app, firebaseTokenService } = setup();

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 2,
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; details: unknown };
      expect(body.error).toBe('Invalid Firebase token request body');
      expect(body.details).toBeDefined();
      expect(firebaseTokenService.registerFirebaseToken).not.toHaveBeenCalled();
    });

    it('platform が不正な値の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 3,
          fcmToken: 'fcm-abc',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('サービスが Student not found を投げた場合は 404 を返す', async () => {
      const { app, firebaseTokenService } = setup();
      (
        firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Student not found'));

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 2,
          fcmToken: 'fcm-abc',
        }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Student not found' });
    });

    it('サービスが例外を投げた場合は 500 と details を返す', async () => {
      const { app, firebaseTokenService } = setup();
      (
        firebaseTokenService.registerFirebaseToken as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/firebase-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: 'S001',
          platform: 2,
          fcmToken: 'fcm-abc',
        }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to register Firebase token',
        details: 'db error',
      });
    });
  });
});
