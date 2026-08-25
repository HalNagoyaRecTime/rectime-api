import type { Context } from 'hono';
import { z } from 'zod';
import type { IAdminNotificationManagementService } from '../../application/services/IAdminNotificationManagementService';
import type { ManualNotificationAudience } from '../../domain/entities/AdminNotification';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';

const notificationIdSchema = z.coerce.number().int().positive();
const audienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z
    .object({
      type: z.literal('class_room'),
      classRoomId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('gathering'),
      gatheringId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('event_participants'),
      eventId: z.number().int().positive(),
    })
    .strict(),
]);
const updateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    audience: audienceSchema.optional(),
  })
  .refine(
    input =>
      input.title !== undefined ||
      input.body !== undefined ||
      input.scheduledAt !== undefined ||
      input.audience !== undefined,
    { message: 'At least one update field is required' }
  );
const listQuerySchema = z
  .object({
    sendStatus: z.enum(['draft', 'sending', 'sent', 'failed']).optional(),
    eventId: z.coerce.number().int().positive().optional(),
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

type AdminNotificationManagementContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createAdminNotificationManagementController(
  service: IAdminNotificationManagementService
) {
  const authorizeManager = async (
    c: AdminNotificationManagementContext
  ): Promise<Response | null> => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (!(await service.canManageAdminNotifications(userId))) {
      return c.json({ error: 'Admin notification management forbidden' }, 403);
    }
    return null;
  };

  const getAdminNotifications = async (
    c: AdminNotificationManagementContext
  ) => {
    const authorizationError = await authorizeManager(c);
    if (authorizationError) return authorizationError;

    const parsedQuery = listQuerySchema.safeParse({
      sendStatus: c.req.query('sendStatus'),
      eventId: c.req.query('eventId'),
      from: c.req.query('from'),
      to: c.req.query('to'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'Invalid admin notification query',
          details: parsedQuery.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await service.getAdminNotifications({
        send_status: parsedQuery.data.sendStatus,
        event_id: parsedQuery.data.eventId,
        from: parsedQuery.data.from,
        to: parsedQuery.data.to,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });
      return c.json({
        notifications: result.notifications,
        total: result.total,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });
    } catch (error) {
      return internalError(c, 'Failed to fetch admin notifications', error);
    }
  };

  const getAdminNotificationById = async (
    c: AdminNotificationManagementContext
  ) => {
    const authorizationError = await authorizeManager(c);
    if (authorizationError) return authorizationError;
    const notificationId = parseNotificationId(c);
    if (notificationId instanceof Response) return notificationId;

    try {
      return c.json(await service.getAdminNotificationById(notificationId));
    } catch (error) {
      return handleManagementError(
        c,
        error,
        'Failed to fetch admin notification'
      );
    }
  };

  const updateAdminNotification = async (
    c: AdminNotificationManagementContext
  ) => {
    const authorizationError = await authorizeManager(c);
    if (authorizationError) return authorizationError;
    const notificationId = parseNotificationId(c);
    if (notificationId instanceof Response) return notificationId;
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid admin notification request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      return c.json(
        await service.updateAdminNotification({
          notification_id: notificationId,
          title: parsedBody.data.title,
          body: parsedBody.data.body,
          scheduled_at: parsedBody.data.scheduledAt,
          audience: parsedBody.data.audience
            ? toAudience(parsedBody.data.audience)
            : undefined,
        })
      );
    } catch (error) {
      return handleManagementError(
        c,
        error,
        'Failed to update admin notification'
      );
    }
  };

  const deleteAdminNotification = async (
    c: AdminNotificationManagementContext
  ) => {
    const authorizationError = await authorizeManager(c);
    if (authorizationError) return authorizationError;
    const notificationId = parseNotificationId(c);
    if (notificationId instanceof Response) return notificationId;

    try {
      await service.deleteAdminNotification(notificationId);
      return c.body(null, 204);
    } catch (error) {
      return handleManagementError(
        c,
        error,
        'Failed to delete admin notification'
      );
    }
  };

  return {
    getAdminNotifications,
    getAdminNotificationById,
    updateAdminNotification,
    deleteAdminNotification,
  };
}

function parseNotificationId(
  c: AdminNotificationManagementContext
): number | Response {
  const parsedId = notificationIdSchema.safeParse(
    c.req.param('notificationId')
  );
  return parsedId.success
    ? parsedId.data
    : c.json({ error: 'Invalid notification ID' }, 400);
}

function toAudience(
  audience: z.infer<typeof audienceSchema>
): ManualNotificationAudience {
  switch (audience.type) {
    case 'all':
      return audience;
    case 'class_room':
      return { type: audience.type, class_room_id: audience.classRoomId };
    case 'gathering':
      return {
        type: audience.type,
        gathering_id: audience.gatheringId,
      };
    case 'event_participants':
      return { type: audience.type, event_id: audience.eventId };
  }
}

function handleManagementError(
  c: AdminNotificationManagementContext,
  error: unknown,
  fallback: string
): Response {
  if (
    error instanceof Error &&
    error.message === 'Admin notification not found'
  ) {
    return c.json({ error: error.message }, 404);
  }
  if (
    error instanceof Error &&
    [
      'Only fully draft notifications can be updated',
      'Only fully draft notifications can be deleted',
      'Notification audience has no active Firebase tokens',
    ].includes(error.message)
  ) {
    return c.json({ error: error.message }, 409);
  }
  if (
    error instanceof Error &&
    error.message === 'Notification audience not found'
  ) {
    return c.json({ error: error.message }, 404);
  }
  return internalError(c, fallback, error);
}

function internalError(
  c: AdminNotificationManagementContext,
  message: string,
  error: unknown
): Response {
  return c.json(
    {
      error: message,
      details: error instanceof Error ? error.message : String(error),
    },
    500
  );
}
