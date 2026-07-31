import { Context } from 'hono';
import { z } from 'zod';
import type { IScheduleService } from '../../application/services/IScheduleService';

const notificationIdSchema = z.coerce.number().int().positive();

const createScheduleSchema = z.object({
  user_id: z.number().int().positive(),
  event_id: z.number().int().positive(),
  notification_id: z.number().int().positive(),
  importance: z.literal(2).default(2),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
  send_at: z.string().datetime({ offset: true }),
});

const updateScheduleSchema = z.object({
  create_user_id: z.number().int().positive(),
  new_event_id: z.number().int().positive(),
  new_importance: z.literal(2).default(2),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
  new_send_at: z.string().datetime({ offset: true }),
  new_gathering_id: z.number().int().positive(),
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
    const parsedId = notificationIdSchema.safeParse(
      c.req.param('notificationId')
    );
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification ID' }, 400);
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

  const updateSchedule = async (c: Context) => {
    const parsedId = notificationIdSchema.safeParse(
      c.req.param('notificationId')
    );
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification ID' }, 400);
    }

    try {
      const parsedBody = updateScheduleSchema.safeParse(await c.req.json());
      if (!parsedBody.success) {
        return c.json({ error: 'Invalid schedule data' }, 400);
      }

      const updatedSchedule = await scheduleService.updateSchedule(
        parsedId.data,
        parsedBody.data
      );
      return c.json(updatedSchedule);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return c.json({ error: 'Invalid schedule data' }, 400);
      }
      if (
        error instanceof Error &&
        error.message === 'Only schedules with "draft" status can be updated.'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json({ error: 'Failed to update schedule' }, 500);
    }
  };

  return {
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
  };
}
