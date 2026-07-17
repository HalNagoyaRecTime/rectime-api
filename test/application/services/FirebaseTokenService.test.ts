import { describe, expect, it, vi } from 'vitest';
import { createFirebaseTokenService } from '../../../src/application/services/FirebaseTokenService';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { RegisterFirebaseTokenResult } from '../../../src/domain/entities/FirebaseToken';

describe('FirebaseTokenService', () => {
  describe('registerFirebaseToken', () => {
    it('リポジトリの register をそのまま呼び出し、結果を返す', async () => {
      const result: RegisterFirebaseTokenResult = {
        user: {
          user_id: 1,
          user_name: 'テスト生徒',
          is_live_active: 1,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        firebaseToken: {
          firebase_token_id: 1,
          user_id: 1,
          platform: 2,
          fcm_token: 'token-a',
          is_firebase_active: 1,
          last_seen_at: '2026-01-01',
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      };
      const repository: IFirebaseTokenRepository = {
        register: vi.fn().mockResolvedValue(result),
        findActiveTokens: vi.fn(),
        deactivate: vi.fn(),
      };
      const service = createFirebaseTokenService(repository);

      const input = {
        studentNumber: '10000',
        platform: 2 as const,
        fcmToken: 'token-a',
      };
      await expect(service.registerFirebaseToken(input)).resolves.toEqual(
        result
      );
      expect(repository.register).toHaveBeenCalledWith(input);
    });
  });
});
