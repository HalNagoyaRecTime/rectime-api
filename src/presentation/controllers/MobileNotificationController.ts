import type { Context } from 'hono';
import { z } from 'zod';
import type { IMobileNotificationService } from '../../application/services/IMobileNotificationService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/sessionAuthentication';

type MobileNotificationContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

const notificationIdSchema = z.coerce.number().int().positive();
const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createMobileNotificationController(
  mobileNotificationService: IMobileNotificationService
) {
  const getAuthenticatedUserId = (
    c: MobileNotificationContext
  ): number | Response => {
    const userId = c.get('authenticatedUserId');
    return userId ?? c.json({ error: 'Authentication required' }, 401);
  };

  const getNotifications = async (c: MobileNotificationContext) => {
    const userId = getAuthenticatedUserId(c);
    if (userId instanceof Response) return userId;

    const parsedQuery = notificationListQuerySchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'Invalid notification list query',
          details: parsedQuery.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await mobileNotificationService.getNotifications(
        userId,
        parsedQuery.data
      );
      return c.json(result);
    } catch {
      return c.json({ error: 'Failed to fetch notifications' }, 500);
    }
  };

  const getNotificationById = async (c: MobileNotificationContext) => {
    const userId = getAuthenticatedUserId(c);
    if (userId instanceof Response) return userId;

    const parsedId = notificationIdSchema.safeParse(
      c.req.param('notificationId')
    );
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification ID' }, 400);
    }

    try {
      return c.json(
        await mobileNotificationService.getNotificationById(
          parsedId.data,
          userId
        )
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return c.json({ error: 'Notification not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch notification' }, 500);
    }
  };

  return {
    getNotifications,
    getNotificationById,
  };
}
