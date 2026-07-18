import type { Context } from 'hono';
import { z } from 'zod';
import type { INotificationScheduleService } from '../../application/services/INotificationScheduleService';

const createNotificationScheduleSchema = z.object({
  userId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  gatheringGroupId: z.number().int().positive(),
  notificationId: z.number().int().positive(),
  importance: z.number().int().min(1).max(4).optional(),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  sendAt: z.string().datetime({ offset: true }),
});

export function createNotificationScheduleController(
  notificationScheduleService: INotificationScheduleService
) {
  const getAllNotificationSchedules = async (c: Context) => {
    try {
      return c.json(
        await notificationScheduleService.getAllNotificationSchedules()
      );
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch notification schedules',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const createNotificationSchedule = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createNotificationScheduleSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid notification schedule request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const schedule =
        await notificationScheduleService.createNotificationSchedule({
          user_id: parsedBody.data.userId,
          event_id: parsedBody.data.eventId,
          gathering_group_id: parsedBody.data.gatheringGroupId,
          notification_id: parsedBody.data.notificationId,
          importance: parsedBody.data.importance,
          send_at: parsedBody.data.sendAt,
        });
      return c.json(schedule, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'User not found',
          'Gathering group is not assigned to event',
          'Notification not found',
        ].includes(error.message)
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to create notification schedule',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { getAllNotificationSchedules, createNotificationSchedule };
}
