import type { Context } from 'hono';
import { z } from 'zod';
import type { INotificationScheduleService } from '../../application/services/INotificationScheduleService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';

const createNotificationScheduleSchema = z.object({
  eventId: z.number().int().positive().nullable().optional(),
  notificationId: z.number().int().positive(),
  firebaseTokenId: z.number().int().positive(),
  importance: z.literal(2).optional(),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  sendAt: z.string().datetime({ offset: true }),
});

const notificationScheduleIdSchema = z.coerce.number().int().positive();

type NotificationScheduleContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

const notificationScheduleListQuerySchema = z
  .object({
    sendStatus: z.enum(['draft', 'sending', 'sent', 'failed']).optional(),
    eventId: z.coerce.number().int().positive().optional(),
    createdUserId: z.coerce.number().int().positive().optional(),
    firebaseTokenId: z.coerce.number().int().positive().optional(),
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
  const requireAuthenticatedUser = (
    c: NotificationScheduleContext
  ): { userId: number } | Response => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    return { userId };
  };

  const getAllNotificationSchedules = async (
    c: NotificationScheduleContext
  ) => {
    const authentication = requireAuthenticatedUser(c);
    if (authentication instanceof Response) return authentication;

    const parsedQuery = notificationScheduleListQuerySchema.safeParse({
      sendStatus: c.req.query('sendStatus'),
      eventId: c.req.query('eventId'),
      createdUserId: c.req.query('createdUserId'),
      firebaseTokenId: c.req.query('firebaseTokenId'),
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
          created_user_id: parsedQuery.data.createdUserId,
          firebase_token_id: parsedQuery.data.firebaseTokenId,
          from: parsedQuery.data.from,
          to: parsedQuery.data.to,
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
        });
      return c.json(
        {
          notification_schedules: result.notification_schedules,
          total: result.total,
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
        },
        200
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

  const getNotificationScheduleById = async (
    c: NotificationScheduleContext
  ) => {
    const authentication = requireAuthenticatedUser(c);
    if (authentication instanceof Response) return authentication;

    const parsedId = notificationScheduleIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification schedule ID' }, 400);
    }

    try {
      return c.json(
        await notificationScheduleService.getNotificationScheduleById(
          parsedId.data
        ),
        200
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

  const deleteNotificationSchedule = async (c: NotificationScheduleContext) => {
    const authentication = requireAuthenticatedUser(c);
    if (authentication instanceof Response) return authentication;

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

  const createNotificationSchedule = async (c: NotificationScheduleContext) => {
    const authentication = requireAuthenticatedUser(c);
    if (authentication instanceof Response) return authentication;

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
          created_user_id: authentication.userId,
          event_id: parsedBody.data.eventId ?? null,
          notification_id: parsedBody.data.notificationId,
          firebase_token_id: parsedBody.data.firebaseTokenId,
          importance: parsedBody.data.importance,
          send_at: parsedBody.data.sendAt,
        });
      return c.json(schedule, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Firebase token not found',
          'Event not found',
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
