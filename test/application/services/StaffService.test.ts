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
      };
      const service = createStaffService(repository);

      const dto = await service.getStaffById(1);

      expect(dto).toEqual({
        staff_id: staff.staff_id,
        user_id: staff.user_id,
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IStaffRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn(),
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
      };
      const service = createStaffService(repository);

      const dtos = await service.getAllStaffs();

      expect(dtos).toEqual([
        { staff_id: 1, user_id: staffs[0].user_id },
        { staff_id: 2, user_id: staffs[1].user_id },
      ]);
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository: IStaffRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue([]),
      };
      const service = createStaffService(repository);

      await expect(service.getAllStaffs()).resolves.toEqual([]);
    });
  });
});
