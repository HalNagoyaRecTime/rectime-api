import { describe, expect, it, vi } from 'vitest';
import { createFirebaseTokenService } from '../../../src/application/services/FirebaseTokenService';
import type { RegisterFirebaseTokenResult } from '../../../src/domain/entities/FirebaseToken';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

describe('FirebaseTokenService', () => {
  it('FirebaseTokenDTOへ変換し、認証済みuserIdをRepositoryへ渡す', async () => {
    const result: RegisterFirebaseTokenResult = {
      firebase_token_id: 1,
      user_id: 7,
      platform: 'android',
      is_firebase_active: true,
      last_seen_at: '2026-09-24 01:02:03',
    };
    const repository: IFirebaseTokenRepository = {
      register: vi.fn().mockResolvedValue(result),
      findActiveTokens: vi.fn(),
      deleteById: vi.fn(),
      deactivateByUserId: vi.fn(),
      findAllByUserId: vi.fn(),
      deleteByUserIdAndFcmToken: vi.fn().mockResolvedValue(undefined),
      deleteByUserId: vi.fn(),
    };
    const service = createFirebaseTokenService(repository);
    const input = {
      userId: 7,
      platform: 'android' as const,
      fcmToken: 'token-a',
    };

    await expect(service.registerFirebaseToken(input)).resolves.toEqual({
      firebaseTokenId: 1,
      userId: 7,
      platform: 'android',
      lastSeenAt: '2026-09-24T01:02:03.000Z',
    });
    expect(repository.register).toHaveBeenCalledWith(input);
  });
});
