import { describe, expect, it, vi } from 'vitest';
import { createFirebaseTokenService } from '../../../src/application/services/FirebaseTokenService';
import type { RegisterFirebaseTokenResult } from '../../../src/domain/entities/FirebaseToken';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

describe('FirebaseTokenService', () => {
  it('認証済みuserIdを含む入力をRepositoryへ渡す', async () => {
    const result: RegisterFirebaseTokenResult = {
      firebase_token_id: 1,
      user_id: 7,
      platform: 'android',
      is_firebase_active: true,
      last_seen_at: '2026-07-24 00:00:00',
    };
    const repository: IFirebaseTokenRepository = {
      register: vi.fn().mockResolvedValue(result),
      deactivateForUser: vi.fn(),
      findActiveTokens: vi.fn(),
      deactivate: vi.fn(),
    };
    const service = createFirebaseTokenService(repository);
    const input = {
      userId: 7,
      platform: 'android' as const,
      fcmToken: 'token-a',
    };

    await expect(service.registerFirebaseToken(input)).resolves.toEqual(result);
    expect(repository.register).toHaveBeenCalledWith(input);
  });

  it('認証ユーザーのFirebase Tokenを無効化する', async () => {
    const repository: IFirebaseTokenRepository = {
      register: vi.fn(),
      deactivateForUser: vi.fn().mockResolvedValue(undefined),
      findActiveTokens: vi.fn(),
      deactivate: vi.fn(),
    };
    const service = createFirebaseTokenService(repository);

    await expect(service.unregisterFirebaseToken(7)).resolves.toBeUndefined();
    expect(repository.deactivateForUser).toHaveBeenCalledWith(7);
  });
});
