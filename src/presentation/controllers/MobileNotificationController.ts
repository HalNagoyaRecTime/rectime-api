import type { Context } from 'hono';
import type { IMobileNotificationService } from '../../application/services/IMobileNotificationService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import {
  mobileNotificationListQuery,
  mobileNotificationIdParams,
} from '../openapi/notification/mobileNotifications';
import { positivePathParamToNumber, type z } from '../openapi/schemas';

type MobileNotificationContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createMobileNotificationController(
  mobileNotificationService: IMobileNotificationService
) {
  type ListQuery = z.infer<typeof mobileNotificationListQuery>;
  type DetailParams = z.infer<typeof mobileNotificationIdParams>;
  const getAuthenticatedUserId = (c: MobileNotificationContext) => {
    const userId = c.get('authenticatedUserId');
    return userId ?? errorResponse(c, CommonErrors.UNAUTHORIZED);
  };

  const getNotifications = async (
    c: MobileNotificationContext,
    query: ListQuery
  ) => {
    const userId = getAuthenticatedUserId(c);
    if (typeof userId !== 'number') return userId;

    try {
      const result = await mobileNotificationService.getNotifications(
        userId,
        query
      );
      return c.json(result, 200);
    } catch {
      return errorResponse(c, NotificationErrors.NOTIFICATION_LIST_FAILED);
    }
  };

  const getNotificationById = async (
    c: MobileNotificationContext,
    params: DetailParams
  ) => {
    const userId = getAuthenticatedUserId(c);
    if (typeof userId !== 'number') return userId;

    const notificationId = positivePathParamToNumber(params.notificationId);
    if (notificationId === undefined) {
      return errorResponse(c, CommonErrors.VALIDATION_ERROR);
    }

    try {
      return c.json(
        await mobileNotificationService.getNotificationById(
          notificationId,
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
