import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

describe('FirebaseTokenRepository', () => {
  let repo: IFirebaseTokenRepository;

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    await env.DB.prepare('DELETE FROM users').run();
    repo = createFirebaseTokenRepository(env.DB);
  });

  describe('register', () => {
    it('未登録の student_number の場合、auth_users と firebase_tokens を新規作成する', async () => {
      const result = await repo.register({
        studentNumber: '10000',
        platform: 'android',
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
        platform: 'android',
        fcm_token: 'token-a',
        is_active: 1,
      });
    });

    it('同じ student_number で再登録すると auth_users を更新する（COALESCEで未指定項目は既存値を維持）', async () => {
      const first = await repo.register({
        studentNumber: '10000',
        platform: 'android',
        fcmToken: 'token-a',
        authProvider: 'firebase',
        providerUserId: 'uid-a',
        email: 'a@example.com',
      });

      const second = await repo.register({
        studentNumber: '10000',
        platform: 'android',
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
        platform: 'android',
        fcmToken: 'token-a',
      });

      const second = await repo.register({
        studentNumber: '10000',
        platform: 'ios',
        fcmToken: 'token-a',
      });

      expect(second.firebaseToken.id).toBe(first.firebaseToken.id);
      expect(second.firebaseToken.platform).toBe('ios');

      const tokens = await repo.findActiveTokens();
      expect(tokens).toHaveLength(1);
    });
  });

  describe('findActiveTokens', () => {
    it('is_active = 1 のトークンのみを id 昇順で返す', async () => {
      await repo.register({
        studentNumber: '10000',
        platform: 'android',
        fcmToken: 'token-a',
      });
      // users.uid は NOT NULL DEFAULT '' + UNIQUE 制約があり、
      // 2人目を register() 経由の素の INSERT に任せると uid='' 同士が衝突するため、
      // 事前に別 uid を持つ行を用意して ON CONFLICT(student_number) の UPDATE 経路に乗せる
      await env.DB.prepare(
        'INSERT INTO users (student_number, uid) VALUES (?, ?)'
      )
        .bind('10001', 'placeholder-uid-10001')
        .run();
      const second = await repo.register({
        studentNumber: '10001',
        platform: 'ios',
        fcmToken: 'token-b',
      });
      await repo.deactivate(second.firebaseToken.id);

      const tokens = await repo.findActiveTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0].fcm_token).toBe('token-a');
    });
  });

  describe('deactivate', () => {
    it('指定した id のトークンを is_active = 0 にする', async () => {
      const registered = await repo.register({
        studentNumber: '10000',
        platform: 'android',
        fcmToken: 'token-a',
      });

      await repo.deactivate(registered.firebaseToken.id);

      const tokens = await repo.findActiveTokens();
      expect(
        tokens.find(t => t.id === registered.firebaseToken.id)
      ).toBeUndefined();
    });
  });
});
