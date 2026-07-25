import { Context } from 'hono';
// import { z } from 'zod';
import type { IScheduleService } from '../../application/services/IScheduleService';

export function createScheduleController(scheduleService: IScheduleService) {
  return {
    getAllSchedules: async (c: Context) => {
      try {
        const schedules = await scheduleService.getAllSchedules();
        return c.json(schedules);
      } catch {
        return c.json({ error: 'Failed to fetch schedules' }, 500);
      }
    },
  };
}
