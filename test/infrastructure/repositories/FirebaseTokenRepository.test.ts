import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

describe('FirebaseTokenRepository', () => {
  let repo: IFirebaseTokenRepository;

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    await env.DB.prepare('DELETE FROM auth_users').run();
    repo = createFirebaseTokenRepository(env.DB);
  });

  describe('register', () => {
    it('未登録の student_number の場合、auth_users と firebase_tokens を新規作成する', async () => {
      const result = await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-a',
        authProvider: 'firebase',
        providerUserId: 'uid-a',
        email: 'a@example.com',
      });

      expect(result.user).toMatchObject({
        student_number: '10000',
        auth_provider: 'firebase',
        provider_user_id: 'uid-a',
        email: 'a@example.com',
        is_active: 1,
      });
      expect(result.firebaseToken).toMatchObject({
        user_id: result.user.id,
        platform: 2,
        fcm_token: 'token-a',
        is_firebase_active: 1,
      });
    });

    it('同じ student_number で再登録すると auth_users を更新する（COALESCEで未指定項目は既存値を維持）', async () => {
      const first = await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-a',
        authProvider: 'firebase',
        providerUserId: 'uid-a',
        email: 'a@example.com',
      });

      const second = await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-b',
      });

      expect(second.user.id).toBe(first.user.id);
      expect(second.user).toMatchObject({
        auth_provider: 'firebase',
        provider_user_id: 'uid-a',
        email: 'a@example.com',
      });
    });

    it('同じ fcm_token で再登録すると firebase_tokens を更新する（新規行を作らない）', async () => {
      const first = await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-a',
      });

      const second = await repo.register({
        studentNumber: '10000',
        platform: 1,
        fcmToken: 'token-a',
      });

      expect(second.firebaseToken.firebase_token_id).toBe(
        first.firebaseToken.firebase_token_id
      );
      expect(second.firebaseToken.platform).toBe(1);

      const tokens = await repo.findActiveTokens();
      expect(tokens).toHaveLength(1);
    });
  });

  describe('findActiveTokens', () => {
    it('is_firebase_active = 1 のトークンのみを firebase_token_id 昇順で返す', async () => {
      await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-a',
      });
      const second = await repo.register({
        studentNumber: '10001',
        platform: 1,
        fcmToken: 'token-b',
      });
      await repo.deactivate(second.firebaseToken.firebase_token_id);

      const tokens = await repo.findActiveTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0].fcm_token).toBe('token-a');
    });
  });

  describe('deactivate', () => {
    it('指定した firebase_token_id のトークンを is_firebase_active = 0 にする', async () => {
      const registered = await repo.register({
        studentNumber: '10000',
        platform: 2,
        fcmToken: 'token-a',
      });

      await repo.deactivate(registered.firebaseToken.firebase_token_id);

      const tokens = await repo.findActiveTokens();
      expect(
        tokens.find(
          t =>
            t.firebase_token_id === registered.firebaseToken.firebase_token_id
        )
      ).toBeUndefined();
    });
  });
});
