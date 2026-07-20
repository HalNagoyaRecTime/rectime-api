import type { Context } from 'hono';
import { z } from 'zod';
import type { INotificationScheduleService } from '../../application/services/INotificationScheduleService';

const createNotificationScheduleSchema = z.object({
  userId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  gatheringGroupId: z.number().int().positive(),
  notificationId: z.number().int().positive(),
  importance: z.literal(2).optional(),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  sendAt: z.string().datetime({ offset: true }),
});

const notificationScheduleIdSchema = z.coerce.number().int().positive();

const notificationScheduleListQuerySchema = z
  .object({
    sendStatus: z.enum(['draft', 'sending', 'sent', 'failed']).optional(),
    eventId: z.coerce.number().int().positive().optional(),
    gatheringGroupId: z.coerce.number().int().positive().optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(
    query =>
      !query.from || !query.to || new Date(query.from) <= new Date(query.to),
    { message: 'from must be before or equal to to', path: ['from'] }
  );

export function createNotificationScheduleController(
  notificationScheduleService: INotificationScheduleService
) {
  const getAllNotificationSchedules = async (c: Context) => {
    const parsedQuery = notificationScheduleListQuerySchema.safeParse({
      sendStatus: c.req.query('sendStatus'),
      eventId: c.req.query('eventId'),
      gatheringGroupId: c.req.query('gatheringGroupId'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'Invalid notification schedule query',
          details: parsedQuery.error.flatten(),
        },
        400
      );
    }

    try {
      const result =
        await notificationScheduleService.getAllNotificationSchedules({
          send_status: parsedQuery.data.sendStatus,
          event_id: parsedQuery.data.eventId,
          gathering_group_id: parsedQuery.data.gatheringGroupId,
          from: parsedQuery.data.from,
          to: parsedQuery.data.to,
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
        });
      return c.json({
        notification_schedules: result.notification_schedules,
        total: result.total,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });
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

  const getNotificationScheduleById = async (c: Context) => {
    const parsedId = notificationScheduleIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification schedule ID' }, 400);
    }

    try {
      return c.json(
        await notificationScheduleService.getNotificationScheduleById(
          parsedId.data
        )
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification schedule not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch notification schedule',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const deleteNotificationSchedule = async (c: Context) => {
    const parsedId = notificationScheduleIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification schedule ID' }, 400);
    }

    try {
      await notificationScheduleService.deleteNotificationSchedule(
        parsedId.data
      );
      return c.body(null, 204);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification schedule not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Only draft notification schedules can be deleted'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to delete notification schedule',
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

  return {
    getAllNotificationSchedules,
    getNotificationScheduleById,
    createNotificationSchedule,
    deleteNotificationSchedule,
  };
}
