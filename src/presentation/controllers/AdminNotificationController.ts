import type { Context } from 'hono';
import { z } from 'zod';
import type { IAdminNotificationService } from '../../application/services/IAdminNotificationService';
import type { ManualNotificationAudience } from '../../domain/entities/AdminNotification';
import type { Env } from '../../lib/env';
import { isEventDate, isValidEventDate } from '../../lib/eventDate';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';

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

const createManualNotificationSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  audience: audienceSchema,
  scheduledAt: z.string().datetime({ offset: true }),
});

type AdminNotificationContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createAdminNotificationController(
  adminNotificationService: IAdminNotificationService
) {
  const createManualNotification = async (c: AdminNotificationContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) return errorResponse(c, CommonErrors.UNAUTHORIZED);
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createManualNotificationSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_MANUAL_NOTIFICATION_REQUEST,
        parsedBody.error.flatten()
      );
    }
    const eventDate = c.env.EVENT_DATE;
    if (!isValidEventDate(eventDate)) {
      return errorResponse(c, CommonErrors.EVENT_DATE_INVALID);
    }
    if (!isEventDate(eventDate, new Date(parsedBody.data.scheduledAt))) {
      return errorResponse(c, NotificationErrors.INVALID_NOTIFICATION_DATE);
    }

    try {
      return c.json(
        await adminNotificationService.createManualNotification({
          created_user_id: userId,
          title: parsedBody.data.title,
          body: parsedBody.data.body,
          audience: toAudience(parsedBody.data.audience),
          scheduled_at: parsedBody.data.scheduledAt,
        }),
        201
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification audience not found'
      ) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_AUDIENCE_NOT_FOUND
        );
      }
      if (
        error instanceof Error &&
        error.message === 'Notification audience has no active Firebase tokens'
      ) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_AUDIENCE_HAS_NO_TOKENS
        );
      }
      return errorResponse(
        c,
        NotificationErrors.MANUAL_NOTIFICATION_CREATE_FAILED
      );
    }
  };

  return { createManualNotification };
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
      return { type: audience.type, gathering_id: audience.gatheringId };
    case 'event_participants':
      return { type: audience.type, event_id: audience.eventId };
  }
}
