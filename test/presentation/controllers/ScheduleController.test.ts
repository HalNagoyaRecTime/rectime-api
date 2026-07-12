import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createScheduleController } from '../../../src/presentation/controllers/ScheduleController';
import { ScheduleNotFoundError } from '../../../src/domain/errors/ScheduleNotFoundError';
import type { IScheduleService } from '../../../src/application/services/IScheduleService';
import type { ScheduleDTO } from '../../../src/application/dto/ScheduleDTO';

function buildSchedule(overrides: Partial<ScheduleDTO> = {}): ScheduleDTO {
  return {
    schedule_id: 1,
    schedule_type: 'ceremony',
    name: '開会式',
    description: null,
    start_time: '09:00',
    end_time: '09:30',
    location: '体育館',
    order: 1,
    ...overrides,
  };
}

function setup() {
  const scheduleService: IScheduleService = {
    getAllSchedules: vi.fn(),
    getScheduleById: vi.fn(),
  };
  const controller = createScheduleController(scheduleService);
  const app = new Hono();
  app.get('/schedules', c => controller.getAllSchedules(c));
  app.get('/schedules/:scheduleId', c => controller.getScheduleById(c));
  return { app, scheduleService };
}

describe('ScheduleController', () => {
  describe('getAllSchedules', () => {
    it('サービスが返したスケジュール一覧と total を 200 で返す', async () => {
      const { app, scheduleService } = setup();
      const schedules = [buildSchedule(), buildSchedule({ schedule_id: 2 })];
      (
        scheduleService.getAllSchedules as ReturnType<typeof vi.fn>
      ).mockResolvedValue(schedules);

      const res = await app.request('/schedules');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ schedules, total: 2 });
    });

    it('サービスが例外を投げた場合は 500 INTERNAL_ERROR を返す', async () => {
      const { app, scheduleService } = setup();
      (
        scheduleService.getAllSchedules as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/schedules');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to fetch schedules',
        code: 'INTERNAL_ERROR',
      });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getScheduleById', () => {
    it('正の整数 ID の場合は存在するスケジュールを 200 で返す', async () => {
      const { app, scheduleService } = setup();
      const schedule = buildSchedule();
      (
        scheduleService.getScheduleById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(schedule);

      const res = await app.request('/schedules/1');

      expect(scheduleService.getScheduleById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(schedule);
    });

    it.each(['0', '-3', '1.5', '1e9', '007', 'abc'])(
      '"%s" のような不正な ID 文字列の場合は 400 INVALID_SCHEDULE_ID を返す',
      async invalidId => {
        const { app, scheduleService } = setup();

        const res = await app.request(
          `/schedules/${encodeURIComponent(invalidId)}`
        );

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          error: 'Invalid schedule ID',
          code: 'INVALID_SCHEDULE_ID',
        });
        expect(scheduleService.getScheduleById).not.toHaveBeenCalled();
      }
    );

    it('サービスが ScheduleNotFoundError を投げた場合は 404 を返す', async () => {
      const { app, scheduleService } = setup();
      (
        scheduleService.getScheduleById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new ScheduleNotFoundError(999));

      const res = await app.request('/schedules/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: 'Schedule not found',
        code: 'SCHEDULE_NOT_FOUND',
      });
    });

    it('サービスがその他の例外を投げた場合は 500 INTERNAL_ERROR を返す', async () => {
      const { app, scheduleService } = setup();
      (
        scheduleService.getScheduleById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/schedules/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to fetch schedule',
        code: 'INTERNAL_ERROR',
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
