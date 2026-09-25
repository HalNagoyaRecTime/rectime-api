import type { Context } from 'hono';
import type { IAdminNotificationQueryService } from '../../application/services/IAdminNotificationQueryService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import {
  adminNotificationIdParams,
  notificationDateRangeQuery,
} from '../openapi/notification';

type AdminNotificationQueryContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createAdminNotificationQueryController(
  service: IAdminNotificationQueryService
) {
  const getAdminNotifications = async (c: AdminNotificationQueryContext) => {
    const parsedQuery = notificationDateRangeQuery.safeParse({
      from: c.req.query('from'),
      to: c.req.query('to'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedQuery.error.flatten()
      );
    }

    try {
      return c.json(await service.getAdminNotifications(parsedQuery.data), 200);
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: '通知一覧の取得に失敗しました',
      });
    }
  };

  const getAdminNotificationById = async (c: AdminNotificationQueryContext) => {
    const parsedParams = adminNotificationIdParams.safeParse({
      notificationId: c.req.param('notificationId'),
    });
    if (!parsedParams.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedParams.error.flatten()
      );
    }

    try {
      const notification = await service.getAdminNotificationById(
        Number(parsedParams.data.notificationId)
      );
      if (!notification) {
        return errorResponse(
          c,
          NotificationErrors.ADMIN_NOTIFICATION_NOT_FOUND
        );
      }
      return c.json(notification, 200);
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: '通知詳細の取得に失敗しました',
      });
    }
  };

  return { getAdminNotifications, getAdminNotificationById };
}
