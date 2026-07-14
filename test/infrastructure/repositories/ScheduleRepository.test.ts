import { describe, expect, it } from 'vitest';
import { createScheduleRepository } from '../../../src/infrastructure/repositories/ScheduleRepository';

describe('ScheduleRepository', () => {
  describe('findAll', () => {
    it('ダミーの予定データを order 昇順で全件返す', async () => {
      const repo = createScheduleRepository();

      const schedules = await repo.findAll();

      expect(schedules.length).toBeGreaterThan(0);
      const orders = schedules.map(s => s.f_order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });

    it('返り値を変更しても内部のダミーデータは変化しない', async () => {
      const repo = createScheduleRepository();

      const first = await repo.findAll();
      first.pop();
      const second = await repo.findAll();

      expect(second.length).toBe(first.length + 1);
    });
  });

  describe('findById', () => {
    it('存在する id の場合は該当する ScheduleEntity を返す', async () => {
      const repo = createScheduleRepository();
      const all = await repo.findAll();
      const target = all[0];

      const schedule = await repo.findById(target.f_schedule_id);

      expect(schedule).toEqual(target);
    });

    it('存在しない id の場合は null を返す', async () => {
      const repo = createScheduleRepository();

      expect(await repo.findById(999999)).toBeNull();
    });
  });
});
