import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStaffRepository } from '../../../src/infrastructure/repositories/StaffRepository';
import type { IStaffRepository } from '../../../src/domain/interfaces/repositories/IStaffRepository';
import {
  seedStaffsTeachers,
  type SeededData,
} from '../../fixtures/staffsTeachers';

describe('StaffRepository', () => {
  let repo: IStaffRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    seeded = await seedStaffsTeachers(env.DB);
    repo = createStaffRepository(env.DB);
  });

  describe('findAll', () => {
    it('staffs に登録されている職員を全件返す', async () => {
      const staffs = await repo.findAll();

      expect(staffs).toHaveLength(seeded.staffs.length);
      const names = staffs.map(s => s.user_name).sort();
      const expected = seeded.staffs.map(s => s.displayName).sort();
      expect(names).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('staffs の id で職員を取得し、users を join して返す', async () => {
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

  describe('deleteByUserId', () => {
    it('指定したuser_idのstaffs行を削除する', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('削除対象職員') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
        .bind(user!.user_id)
        .run();

      await expect(repo.deleteByUserId(user!.user_id)).resolves.toBe(true);

      const row = await env.DB.prepare('SELECT * FROM staffs WHERE user_id = ?')
        .bind(user!.user_id)
        .first();
      expect(row).toBeNull();
    });

    it('該当するstaffs行が存在しない場合はfalseを返す(冪等)', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('非職員') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.deleteByUserId(user!.user_id)).resolves.toBe(false);
    });
  });
});
