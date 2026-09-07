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

  // このテストの中でだけ使う、staffs行数の数え上げ。
  const countStaffRows = async (userId: number): Promise<number> => {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM staffs WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ count: number }>();
    return row!.count;
  };

  const insertUser = async (
    userName: string,
    deletionStatus = 'active'
  ): Promise<number> => {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name, deletion_status) VALUES (?, ?) RETURNING user_id'
    )
      .bind(userName, deletionStatus)
      .first<{ user_id: number }>();
    return user!.user_id;
  };

  describe('addByUserId', () => {
    it('指定したuser_idのstaffs行を追加する', async () => {
      const userId = await insertUser('権限付与対象');

      await repo.addByUserId(userId);

      expect(await countStaffRows(userId)).toBe(1);
    });

    it('すでにstaffの場合も成功し、行が増えない(冪等)', async () => {
      const userId = await insertUser('二重付与対象');

      await repo.addByUserId(userId);
      await repo.addByUserId(userId);

      expect(await countStaffRows(userId)).toBe(1);
    });

    it('付与してもusersのレコードは残る', async () => {
      const userId = await insertUser('付与後も残るUser');

      await repo.addByUserId(userId);
      await repo.deleteByUserId(userId);

      const user = await env.DB.prepare(
        'SELECT user_id FROM users WHERE user_id = ?'
      )
        .bind(userId)
        .first();
      expect(user).not.toBeNull();
      expect(await countStaffRows(userId)).toBe(0);
    });
  });

  describe('existsActiveUser', () => {
    it('退会していないUserが存在する場合はtrueを返す', async () => {
      const userId = await insertUser('在籍User');

      await expect(repo.existsActiveUser(userId)).resolves.toBe(true);
    });

    it('存在しないuser_idの場合はfalseを返す', async () => {
      await expect(repo.existsActiveUser(999999)).resolves.toBe(false);
    });

    it('退会済み(deletion_statusがactive以外)のUserはfalseを返す', async () => {
      const userId = await insertUser('退会済みUser', 'deleted');

      await expect(repo.existsActiveUser(userId)).resolves.toBe(false);
    });

    it('一時無効化(is_live_active=0)されていてもtrueを返す', async () => {
      const userId = await insertUser('無効化中User');
      await env.DB.prepare(
        'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
      )
        .bind(userId)
        .run();

      await expect(repo.existsActiveUser(userId)).resolves.toBe(true);
    });
  });
});
