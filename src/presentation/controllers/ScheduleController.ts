import { Context } from 'hono';
import { IScheduleService } from '../../application/services/IScheduleService';

export function createScheduleController(scheduleService: IScheduleService) {
  const getAllSchedules = async (c: Context) => {
    try {
      const schedules = await scheduleService.getAllSchedules();
      return c.json({ schedules, total: schedules.length });
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch schedules',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getScheduleById = async (c: Context) => {
    try {
      const scheduleIdParam = c.req.param('scheduleId');
      const id = Number(scheduleIdParam);

      if (!scheduleIdParam || Number.isNaN(id)) {
        return c.json(
          { error: 'Invalid schedule ID', code: 'INVALID_SCHEDULE_ID' },
          400
        );
      }

      const schedule = await scheduleService.getScheduleById(id);
      return c.json(schedule);
    } catch (error) {
      if (error instanceof Error && error.message === 'Schedule not found') {
        return c.json(
          { error: 'Schedule not found', code: 'SCHEDULE_NOT_FOUND' },
          404
        );
      }
      return c.json(
        {
          error: 'Failed to fetch schedule',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { getAllSchedules, getScheduleById };
}
