import { describe, expect, it, vi } from 'vitest';
import { createUserService } from '../../../src/application/services/UserService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { IUserStatusRepository } from '../../../src/domain/interfaces/repositories/IUserStatusRepository';

const OPERATOR_USER_ID = 1;
const TARGET_USER_ID = 10;

function buildUserRepository(
  overrides: Partial<IUserRepository> = {}
): IUserRepository {
  return {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn(),
    isStaff: vi.fn().mockResolvedValue(true),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
    ...overrides,
  };
}

function buildUserStatusRepository(
  overrides: Partial<IUserStatusRepository> = {}
): IUserStatusRepository {
  return {
    updateLiveActive: vi
      .fn()
      .mockResolvedValue({ user_id: TARGET_USER_ID, is_live_active: false }),
    hasOtherActiveStaff: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createService(
  userRepository = buildUserRepository(),
  userStatusRepository = buildUserStatusRepository()
) {
  return {
    service: createUserService(userRepository, userStatusRepository),
    userRepository,
    userStatusRepository,
  };
}

describe('UserService', () => {
  describe('canManageUserStatus', () => {
    it('staffかどうかで判定する', async () => {
      const { service, userRepository } = createService(
        buildUserRepository({ isStaff: vi.fn().mockResolvedValue(false) })
      );

      await expect(service.canManageUserStatus(OPERATOR_USER_ID)).resolves.toBe(
        false
      );
      expect(userRepository.isStaff).toHaveBeenCalledWith(OPERATOR_USER_ID);
    });
  });

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

    it('他に有効なstaffがいない場合は断り、DBを更新しない', async () => {
      const { service, userStatusRepository } = createService(
        buildUserRepository(),
        buildUserStatusRepository({
          hasOtherActiveStaff: vi.fn().mockResolvedValue(false),
        })
      );

      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: TARGET_USER_ID,
          is_live_active: false,
        })
      ).rejects.toThrow('Cannot deactivate the last active staff');
      expect(userStatusRepository.updateLiveActive).not.toHaveBeenCalled();
    });

    it('有効化のときは締め出しが起きないため、上記の判定を行わない', async () => {
      const { service, userStatusRepository } = createService(
        buildUserRepository(),
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue({
            user_id: OPERATOR_USER_ID,
            is_live_active: true,
          }),
          hasOtherActiveStaff: vi.fn().mockResolvedValue(false),
        })
      );

      // 対象が自分自身で、かつ他に有効なstaffがいなくても有効化はできる
      await expect(
        service.updateUserStatus({
          operator_user_id: OPERATOR_USER_ID,
          user_id: OPERATOR_USER_ID,
          is_live_active: true,
        })
      ).resolves.toEqual({ user_id: OPERATOR_USER_ID, is_live_active: true });
      expect(userStatusRepository.hasOtherActiveStaff).not.toHaveBeenCalled();
    });

    it('対象Userが存在しない場合はエラーを投げる', async () => {
      const { service } = createService(
        buildUserRepository(),
        buildUserStatusRepository({
          updateLiveActive: vi.fn().mockResolvedValue(null),
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
  });
});
