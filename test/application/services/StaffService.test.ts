import { describe, expect, it, vi } from 'vitest';
import { createStaffService } from '../../../src/application/services/StaffService';
import type { IStaffRepository } from '../../../src/domain/interfaces/repositories/IStaffRepository';
import type { StaffEntity } from '../../../src/domain/entities/Staff';

function buildStaff(overrides: Partial<StaffEntity> = {}): StaffEntity {
  return {
    staff_id: 1,
    user_id: 10,
    user_name: '佐々木職員',
    ...overrides,
  };
}

describe('StaffService', () => {
  describe('getStaffById', () => {
    it('存在する場合は StaffEntity を StaffDTO にマッピングして返す', async () => {
      const staff = buildStaff();
      const repository: IStaffRepository = {
        findById: vi.fn().mockResolvedValue(staff),
        findAll: vi.fn(),
        deleteByUserId: vi.fn(),
        addByUserId: vi.fn(),
        existsActiveUser: vi.fn(),
        deleteByUserIdUnlessLastActiveStaff: vi.fn(),
        existsStaff: vi.fn(),
      };
      const service = createStaffService(repository);

      const dto = await service.getStaffById(1);

      expect(dto).toEqual({
        staff_id: staff.staff_id,
        user_id: staff.user_id,
        display_name: staff.user_name,
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IStaffRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn(),
        deleteByUserId: vi.fn(),
        addByUserId: vi.fn(),
        existsActiveUser: vi.fn(),
        deleteByUserIdUnlessLastActiveStaff: vi.fn(),
        existsStaff: vi.fn(),
      };
      const service = createStaffService(repository);

      await expect(service.getStaffById(999)).rejects.toThrow(
        'Staff not found'
      );
    });
  });

  describe('getAllStaffs', () => {
    it('全件を StaffDTO の配列にマッピングして返す', async () => {
      const staffs = [
        buildStaff({ staff_id: 1 }),
        buildStaff({ staff_id: 2, user_name: '伊藤職員' }),
      ];
      const repository: IStaffRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue(staffs),
        deleteByUserId: vi.fn(),
        addByUserId: vi.fn(),
        existsActiveUser: vi.fn(),
        deleteByUserIdUnlessLastActiveStaff: vi.fn(),
        existsStaff: vi.fn(),
      };
      const service = createStaffService(repository);

      const dtos = await service.getAllStaffs();

      expect(dtos).toHaveLength(2);
      expect(dtos.map(d => d.display_name)).toEqual(['佐々木職員', '伊藤職員']);
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository: IStaffRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue([]),
        deleteByUserId: vi.fn(),
        addByUserId: vi.fn(),
        existsActiveUser: vi.fn(),
        deleteByUserIdUnlessLastActiveStaff: vi.fn(),
        existsStaff: vi.fn(),
      };
      const service = createStaffService(repository);

      await expect(service.getAllStaffs()).resolves.toEqual([]);
    });
  });

  // 付与・解除で共通のモック。個別のケースで振る舞いを差し替える。
  function buildRoleRepository(
    overrides: Partial<IStaffRepository> = {}
  ): IStaffRepository {
    return {
      findById: vi.fn(),
      findAll: vi.fn(),
      deleteByUserId: vi.fn().mockResolvedValue(true),
      addByUserId: vi.fn(),
      existsActiveUser: vi.fn().mockResolvedValue(true),
      deleteByUserIdUnlessLastActiveStaff: vi.fn().mockResolvedValue(true),
      existsStaff: vi.fn().mockResolvedValue(false),
      ...overrides,
    };
  }

  describe('assignStaffRole', () => {
    it('対象Userが存在する場合はstaffs行を追加する', async () => {
      const repository = buildRoleRepository();
      const service = createStaffService(repository);

      await service.assignStaffRole(10);

      expect(repository.existsActiveUser).toHaveBeenCalledWith(10);
      expect(repository.addByUserId).toHaveBeenCalledWith(10);
    });

    it('対象Userが存在しない場合はエラーを投げ、staffsへ書き込まない', async () => {
      const repository = buildRoleRepository({
        existsActiveUser: vi.fn().mockResolvedValue(false),
      });
      const service = createStaffService(repository);

      await expect(service.assignStaffRole(999)).rejects.toThrow(
        'User not found'
      );
      expect(repository.addByUserId).not.toHaveBeenCalled();
    });
  });

  describe('revokeStaffRole', () => {
    it('対象Userが存在する場合はstaffs行を削除する', async () => {
      const repository = buildRoleRepository();
      const service = createStaffService(repository);

      await service.revokeStaffRole({ operator_user_id: 1, user_id: 10 });

      expect(repository.existsActiveUser).toHaveBeenCalledWith(10);
      expect(
        repository.deleteByUserIdUnlessLastActiveStaff
      ).toHaveBeenCalledWith(10);
    });

    it('対象がstaffでなくても(削除0件でも)成功する', async () => {
      const repository = buildRoleRepository({
        deleteByUserIdUnlessLastActiveStaff: vi.fn().mockResolvedValue(false),
        // staff行が残っていない = そもそもstaffではなかった
        existsStaff: vi.fn().mockResolvedValue(false),
      });
      const service = createStaffService(repository);

      await expect(
        service.revokeStaffRole({ operator_user_id: 1, user_id: 10 })
      ).resolves.toBeUndefined();
    });

    it('最後の有効なstaffだった場合はエラーを投げる', async () => {
      const repository = buildRoleRepository({
        deleteByUserIdUnlessLastActiveStaff: vi.fn().mockResolvedValue(false),
        // 削除されずstaff行が残っている = 条件付き削除に断られた
        existsStaff: vi.fn().mockResolvedValue(true),
      });
      const service = createStaffService(repository);

      await expect(
        service.revokeStaffRole({ operator_user_id: 1, user_id: 10 })
      ).rejects.toThrow('Cannot revoke the last active staff');
    });

    it('対象Userが存在しない場合はエラーを投げ、staffsを削除しない', async () => {
      const repository = buildRoleRepository({
        existsActiveUser: vi.fn().mockResolvedValue(false),
      });
      const service = createStaffService(repository);

      await expect(
        service.revokeStaffRole({ operator_user_id: 1, user_id: 999 })
      ).rejects.toThrow('User not found');
      expect(
        repository.deleteByUserIdUnlessLastActiveStaff
      ).not.toHaveBeenCalled();
    });

    it('自分自身の解除はエラーを投げ、staffsを削除しない', async () => {
      const repository = buildRoleRepository();
      const service = createStaffService(repository);

      await expect(
        service.revokeStaffRole({ operator_user_id: 6, user_id: 6 })
      ).rejects.toThrow('Cannot revoke your own staff role');
      expect(
        repository.deleteByUserIdUnlessLastActiveStaff
      ).not.toHaveBeenCalled();
      // 存在確認へ進む前に断る。対象は操作者自身なので存在は自明。
      expect(repository.existsActiveUser).not.toHaveBeenCalled();
    });
  });
});
