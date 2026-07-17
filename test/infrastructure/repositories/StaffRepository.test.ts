import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStaffRepository } from '../../../src/infrastructure/repositories/StaffRepository';
import type { IStaffRepository } from '../../../src/domain/interfaces/repositories/IStaffRepository';
import {
  seedStaffsAndTeachers,
  type SeededStaffTeacherData,
} from '../../fixtures/staffs-teachers';

describe('StaffRepository', () => {
  let repo: IStaffRepository;
  let seeded: SeededStaffTeacherData;

  beforeAll(async () => {
    seeded = await seedStaffsAndTeachers(env.DB);
    repo = createStaffRepository(env.DB);
  });

  describe('findAll', () => {
    it('staffs に登録されているスタッフを全件返す', async () => {
      const staffs = await repo.findAll();

      expect(staffs).toHaveLength(seeded.staffs.length);
      const names = staffs.map(s => s.user_name).sort();
      const expected = seeded.staffs.map(s => s.displayName).sort();
      expect(names).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('staffs の id でスタッフを取得し、users を join して返す', async () => {
      const target = seeded.staffs[0];
      const staff = await repo.findById(target.staffId);

      expect(staff).toMatchObject({
        staff_id: target.staffId,
        user_id: target.userId,
        user_name: target.displayName,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });
});
