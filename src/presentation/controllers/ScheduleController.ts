import { Context } from 'hono';
import { z } from 'zod';
import type { IScheduleService } from '../../application/services/IScheduleService';

const scheduleIdSchema = z.coerce.number().int().positive();

const createScheduleSchema = z.object({
  eventId: z.number().int().positive().nullable().optional(),
  notificationId: z.number().int().positive(),
  firebaseTokenId: z.number().int().positive(),
  importance: z.literal(2).optional(),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  sendAt: z.string().datetime({ offset: true }),
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

  return {
    getAllSchedules,
    getScheduleById,
  };
}
