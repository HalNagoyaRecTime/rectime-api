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
  mobileNotificationIdParams,
  mobileNotificationListQuery,
} from '../openapi/notification/mobileNotifications';
import { positivePathParamToNumber } from '../openapi/schemas';

type MobileNotificationContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

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

    const parsedQuery = mobileNotificationListQuery.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
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

    const parsedParams = mobileNotificationIdParams.safeParse({
      notificationId: c.req.param('notificationId'),
    });
    if (!parsedParams.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedParams.error.flatten()
      );
    }
    const notificationId = positivePathParamToNumber(
      parsedParams.data.notificationId
    );
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
