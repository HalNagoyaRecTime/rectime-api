import { describe, expect, it, vi } from 'vitest';
import { createScheduleService } from '../../../src/application/services/ScheduleService';
import type { IScheduleRepository } from '../../../src/domain/interfaces/repositories/IScheduleRepository';
import type { ScheduleEntity } from '../../../src/domain/entities/Schedule';
import { ScheduleNotFoundError } from '../../../src/domain/errors/ScheduleNotFoundError';

function buildSchedule(
  overrides: Partial<ScheduleEntity> = {}
): ScheduleEntity {
  return {
    f_schedule_id: 1,
    f_schedule_type: 'ceremony',
    f_name: '開会式',
    f_description: '説明',
    f_start_time: '09:00',
    f_end_time: '09:20',
    f_location: '体育館',
    f_order: 1,
    ...overrides,
  };
}

describe('ScheduleService', () => {
  describe('getAllSchedules', () => {
    it('ScheduleEntity の配列を ScheduleDTO の配列にマッピングして返す', async () => {
      const schedules = [buildSchedule()];
      const repository: IScheduleRepository = {
        findAll: vi.fn().mockResolvedValue(schedules),
        findById: vi.fn(),
      };
      const service = createScheduleService(repository);

      const dtos = await service.getAllSchedules();

      expect(dtos).toEqual([
        {
          schedule_id: 1,
          schedule_type: 'ceremony',
          name: '開会式',
          description: '説明',
          start_time: '09:00',
          end_time: '09:20',
          location: '体育館',
          order: 1,
        },
      ]);
    });
  });

  describe('getScheduleById', () => {
    it('存在する場合は ScheduleDTO を返す', async () => {
      const schedule = buildSchedule();
      const repository: IScheduleRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(schedule),
      };
      const service = createScheduleService(repository);

      const dto = await service.getScheduleById(1);

      expect(dto).toEqual({
        schedule_id: 1,
        schedule_type: 'ceremony',
        name: '開会式',
        description: '説明',
        start_time: '09:00',
        end_time: '09:20',
        location: '体育館',
        order: 1,
      });
    });

    it('存在しない場合は ScheduleNotFoundError を投げる', async () => {
      const repository: IScheduleRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      };
      const service = createScheduleService(repository);

      await expect(service.getScheduleById(999)).rejects.toThrow(
        ScheduleNotFoundError
      );
      await expect(service.getScheduleById(999)).rejects.toThrow(
        'Schedule not found: id=999'
      );
    });
  });
});
