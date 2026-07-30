import { Context } from 'hono';
import { z } from 'zod';
import type { IScheduleService } from '../../application/services/IScheduleService';
import { HttpError } from '../../domain/entities/Schedule';

const notificationIdSchema = z.coerce.number().int().positive();

const normalizeScheduleBody = (input: unknown) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  const normalized = { ...record };
  const aliases: Record<string, string> = {
    userId: 'user_id',
    eventId: 'event_id',
    notificationId: 'notification_id',
    sendAt: 'send_at',
    gatheringId: 'gathering_id',
  };

  for (const [camelCaseKey, snakeCaseKey] of Object.entries(aliases)) {
    if (
      record[camelCaseKey] !== undefined &&
      record[snakeCaseKey] === undefined
    ) {
      normalized[snakeCaseKey] = record[camelCaseKey];
    }
  }

  return normalized;
};

const createScheduleSchema = z.preprocess(
  normalizeScheduleBody,
  z.object({
    user_id: z.number().int().positive(),
    event_id: z.number().int().positive(),
    notification_id: z.number().int().positive(),
    importance: z.literal(2).default(2),
    // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
    send_at: z.string().datetime({ offset: true }),
  })
);

const updateScheduleSchema = z.preprocess(
  normalizeScheduleBody,
  z.object({
    user_id: z.number().int().positive(),
    event_id: z.number().int().positive(),
    importance: z.literal(2).default(2),
    // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
    send_at: z.string().datetime({ offset: true }),
    gathering_id: z.number().int().positive(),
  })
);

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
      console.error('Update Schedule Error:', error);
      if (error instanceof SyntaxError) {
        return c.json({ error: 'Invalid schedule data' }, 400);
      }
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.statusCode);
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
