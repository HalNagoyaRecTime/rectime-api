import { describe, expect, it, vi } from 'vitest';
import { createUserService } from '../../../src/application/services/UserService';
import type { IUserStatusRepository } from '../../../src/domain/interfaces/repositories/IUserStatusRepository';

const OPERATOR_USER_ID = 1;
const TARGET_USER_ID = 10;

function buildUserStatusRepository(
  overrides: Partial<IUserStatusRepository> = {}
): IUserStatusRepository {
  return {
    updateLiveActive: vi
      .fn()
      .mockResolvedValue({ user_id: TARGET_USER_ID, is_live_active: false }),
    existsActiveUser: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createService(userStatusRepository = buildUserStatusRepository()) {
  return {
    service: createUserService(userStatusRepository),
    userStatusRepository,
  };
}

describe('UserService', () => {
  describe('updateUserStatus', () => {
    it('他のUserを無効化できる', async () => {
      const { service, userStatusRepository } = createService();

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: TARGET_USER_ID,
          is_live_active: false,
        })
      ).resolves.toEqual({ user_id: TARGET_USER_ID, is_live_active: false });
      expect(userStatusRepository.updateLiveActive).toHaveBeenCalledWith(
        TARGET_USER_ID,
        false
      );
    });

    it('自分自身の無効化は断り、DBを更新しない', async () => {
      const { service, userStatusRepository } = createService();

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: OPERATOR_USER_ID,
          is_live_active: false,
        })
      ).rejects.toThrow('Cannot deactivate yourself');
      expect(userStatusRepository.updateLiveActive).not.toHaveBeenCalled();
    });

    // 最後の稼働中staffかどうかは更新と同じSQL文で判定するため、Service側は
    // 「更新できなかった」ことと「対象が残っている」ことから理由を導く。
    it('最後の稼働中staffで更新が拒まれた場合は断る', async () => {
      const { service } = createService(
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue(null),
          existsActiveUser: vi.fn().mockResolvedValue(true),
        })
      );

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: TARGET_USER_ID,
          is_live_active: false,
        })
      ).rejects.toThrow('Cannot deactivate the last active staff');
    });

    it('有効化のときは対象が自分自身でも通る', async () => {
      const { service } = createService(
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue({
            user_id: OPERATOR_USER_ID,
            is_live_active: true,
          }),
        })
      );

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: OPERATOR_USER_ID,
          is_live_active: true,
        })
      ).resolves.toEqual({ user_id: OPERATOR_USER_ID, is_live_active: true });
    });

    it('対象Userが存在しない場合はエラーを投げる', async () => {
      const { service } = createService(
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue(null),
          existsActiveUser: vi.fn().mockResolvedValue(false),
        })
      );

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: 999,
          is_live_active: false,
        })
      ).rejects.toThrow('User not found');
    });

    // 退会済みUserへの有効化はRepositoryが更新しない。無効化ではないので
    // 「最後の管理者」ではなく、対象が見つからなかった扱いにする。
    it('有効化が拒まれた場合は対象なしとして扱う', async () => {
      const { service, userStatusRepository } = createService(
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue(null),
        })
      );

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: TARGET_USER_ID,
          is_live_active: true,
        })
      ).rejects.toThrow('User not found');
      expect(userStatusRepository.existsActiveUser).not.toHaveBeenCalled();
    });
  });
});
