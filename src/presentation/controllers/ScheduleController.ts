import { Context } from 'hono';
import { z } from 'zod';
import type { IScheduleService } from '../../application/services/IScheduleService';

const scheduleIdSchema = z.coerce.number().int().positive();

const createScheduleSchema = z.object({
  user_id: z.number().int().positive(),
  event_id: z.number().int().positive(),
  notification_id: z.number().int().positive(),
  importance: z.literal(2).default(2),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  send_at: z.string().datetime({ offset: true }),
});

export function createScheduleController(scheduleService: IScheduleService) {
  const getAllSchedules = async (c: Context) => {
    try {
      const schedules = await scheduleService.getAllSchedules();
      return c.json(schedules);
    } catch {
      return c.json({ error: 'Failed to fetch schedules' }, 500);
    }
  };

  const getScheduleById = async (c: Context) => {
    const parsedId = scheduleIdSchema.safeParse(c.req.param('scheduleId'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid schedule ID' }, 400);
    }

    try {
      const schedule = await scheduleService.getScheduleById(parsedId.data);
      if (!schedule) {
        return c.json({ error: 'Schedule not found' }, 404);
      }
      return c.json(schedule);
    } catch {
      return c.json({ error: 'Failed to fetch schedule' }, 500);
    }
  };

  const createSchedule = async (c: Context) => {
    const parsedBody = createScheduleSchema.safeParse(await c.req.json());
    if (!parsedBody.success) {
      return c.json({ error: 'Invalid schedule data' }, 400);
    }

    try {
      const createdSchedule = await scheduleService.createSchedule(
        parsedBody.data
      );
      return c.json(createdSchedule, 201);
    } catch {
      return c.json({ error: 'Failed to create schedule' }, 500);
    }
  };

  return {
    getAllSchedules,
    getScheduleById,
    createSchedule,
  };
}
