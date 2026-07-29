import type { Context } from 'hono';
import { z } from 'zod';
import type { IAdminNotificationService } from '../../application/services/IAdminNotificationService';
import type { ManualNotificationAudience } from '../../domain/entities/AdminNotification';
import type { Env } from '../../lib/env';
import { isEventDate, isValidEventDate } from '../../lib/eventDate';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/sessionAuthentication';

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
  Variables: ContainerVariables & AuthenticationVariables;
}>;

export function createAdminNotificationController(
  adminNotificationService: IAdminNotificationService
) {
  const createManualNotification = async (c: AdminNotificationContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (!(await adminNotificationService.canCreateManualNotification(userId))) {
      return c.json({ error: 'Manual notification creation forbidden' }, 403);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createManualNotificationSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid manual notification request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }
    const eventDate = c.env.EVENT_DATE;
    if (!isValidEventDate(eventDate)) {
      return c.json({ error: 'EVENT_DATE is not configured correctly' }, 500);
    }
    if (!isEventDate(eventDate, new Date(parsedBody.data.scheduledAt))) {
      return c.json(
        {
          error: 'scheduledAt must be on EVENT_DATE',
          code: 'INVALID_NOTIFICATION_DATE',
        },
        400
      );
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
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Notification audience has no active Firebase tokens'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to create manual notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
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
      return {
        type: audience.type,
        gathering_id: audience.gatheringId,
      };
    case 'event_participants':
      return { type: audience.type, event_id: audience.eventId };
  }
}
