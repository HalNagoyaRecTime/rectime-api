import type { Context } from 'hono';
import { z } from 'zod';
import type { IMobileNotificationService } from '../../application/services/IMobileNotificationService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';

type MobileNotificationContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

const notificationIdSchema = z.coerce.number().int().positive();
const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createMobileNotificationController(
  mobileNotificationService: IMobileNotificationService
) {
  const getAuthenticatedUserId = (c: MobileNotificationContext) => {
    const userId = c.get('authenticatedUserId');
    return userId ?? errorResponse(c, CommonErrors.UNAUTHORIZED);
  };

  const getNotifications = async (c: MobileNotificationContext) => {
    const userId = getAuthenticatedUserId(c);
    if (typeof userId !== 'number') return userId;

    const parsedQuery = notificationListQuerySchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    try {
      const result = await mobileNotificationService.getNotifications(
        userId,
        parsedQuery.data
      );
      return c.json(result, 200);
    } catch {
      return errorResponse(c, NotificationErrors.NOTIFICATION_LIST_FAILED);
    }
  };

  const getNotificationById = async (c: MobileNotificationContext) => {
    const userId = getAuthenticatedUserId(c);
    if (typeof userId !== 'number') return userId;

    const parsedId = notificationIdSchema.safeParse(
      c.req.param('notificationId')
    );
    if (!parsedId.success) {
      return errorResponse(c, NotificationErrors.INVALID_NOTIFICATION_ID);
    }

    try {
      return c.json(
        await mobileNotificationService.getNotificationById(
          parsedId.data,
          userId
        ),
        200
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return errorResponse(c, NotificationErrors.NOTIFICATION_NOT_FOUND);
      }
      return errorResponse(c, NotificationErrors.NOTIFICATION_FETCH_FAILED);
    }
  };

  return {
    getNotifications,
    getNotificationById,
  };
}
