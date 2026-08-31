import type { Context } from 'hono';
import { z } from 'zod';
import type { INotificationScheduleService } from '../../application/services/INotificationScheduleService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { NotificationErrors } from '../errors/notificationErrors';

const createNotificationScheduleSchema = z.object({
  eventId: z.number().int().positive().nullable().optional(),
  notificationId: z.number().int().positive(),
  firebaseTokenId: z.number().int().positive(),
  importance: z.literal(2).optional(),
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
  const authorizeManager = async (c: NotificationScheduleContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) return errorResponse(c, CommonErrors.UNAUTHORIZED);
    if (
      !(await notificationScheduleService.canManageNotificationSchedules(
        userId
      ))
    ) {
      return errorResponse(c, CommonErrors.STAFF_REQUIRED);
    }
    return { userId };
  };

  const getAllNotificationSchedules = async (
    c: NotificationScheduleContext
  ) => {
    const authorization = await authorizeManager(c);
    if (!('userId' in authorization)) return authorization;

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
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_SCHEDULE_QUERY,
        parsedQuery.error.flatten()
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
    } catch {
      return errorResponse(
        c,
        NotificationErrors.NOTIFICATION_SCHEDULE_LIST_FAILED
      );
    }
  };

  const getNotificationScheduleById = async (
    c: NotificationScheduleContext
  ) => {
    const authorization = await authorizeManager(c);
    if (!('userId' in authorization)) return authorization;

    const parsedId = notificationScheduleIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_SCHEDULE_ID
      );
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
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
        );
      }
      return errorResponse(
        c,
        NotificationErrors.NOTIFICATION_SCHEDULE_FETCH_FAILED
      );
    }
  };

  const deleteNotificationSchedule = async (c: NotificationScheduleContext) => {
    const authorization = await authorizeManager(c);
    if (!('userId' in authorization)) return authorization;

    const parsedId = notificationScheduleIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_SCHEDULE_ID
      );
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
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
        );
      }
      if (
        error instanceof Error &&
        error.message === 'Only draft notification schedules can be deleted'
      ) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_DRAFT
        );
      }
      return errorResponse(
        c,
        NotificationErrors.NOTIFICATION_SCHEDULE_DELETE_FAILED
      );
    }
  };

  const createNotificationSchedule = async (c: NotificationScheduleContext) => {
    const authorization = await authorizeManager(c);
    if (!('userId' in authorization)) return authorization;

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createNotificationScheduleSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_SCHEDULE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const schedule =
        await notificationScheduleService.createNotificationSchedule({
          created_user_id: authorization.userId,
          event_id: parsedBody.data.eventId ?? null,
          notification_id: parsedBody.data.notificationId,
          firebase_token_id: parsedBody.data.firebaseTokenId,
          importance: parsedBody.data.importance,
          send_at: parsedBody.data.sendAt,
        });
      return c.json(schedule, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Firebase token not found') {
          return errorResponse(c, NotificationErrors.FIREBASE_TOKEN_NOT_FOUND);
        }
        if (error.message === 'Event not found') {
          return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
        }
        if (error.message === 'Notification not found') {
          return errorResponse(c, NotificationErrors.NOTIFICATION_NOT_FOUND);
        }
      }
      return errorResponse(
        c,
        NotificationErrors.NOTIFICATION_SCHEDULE_CREATE_FAILED
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
