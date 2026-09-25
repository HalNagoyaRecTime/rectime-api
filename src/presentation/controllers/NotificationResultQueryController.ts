import type { Context } from 'hono';
import type { INotificationResultQueryService } from '../../application/services/INotificationResultQueryService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import { notificationPushDeliveryIdParams } from '../openapi/notification/pushDeliveries';
import { notificationScheduleIdParams } from '../openapi/notification/schedules';
import { notificationResultsQuery } from '../openapi/notification/commonSchemas';

type NotificationResultQueryContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createNotificationResultQueryController(
  service: INotificationResultQueryService
) {
  const getScheduleResults = async (c: NotificationResultQueryContext) => {
    const parsedParams = notificationScheduleIdParams.safeParse({
      notificationScheduleId: c.req.param('notificationScheduleId'),
    });
    const parsedQuery = notificationResultsQuery.safeParse({
      page: c.req.query('page'),
      limit: c.req.query('limit'),
    });
    if (!parsedParams.success || !parsedQuery.success) {
      const error = !parsedParams.success
        ? parsedParams.error
        : parsedQuery.success
          ? undefined
          : parsedQuery.error;
      return errorResponse(c, CommonErrors.VALIDATION_ERROR, error?.flatten());
    }

    try {
      const result = await service.getScheduleResults(
        Number(parsedParams.data.notificationScheduleId),
        parsedQuery.data
      );
      if (!result) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
        );
      }
      return c.json(result, 200);
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: '通知スケジュールの受信者結果取得に失敗しました',
      });
    }
  };

  const getPushDeliveryDetail = async (c: NotificationResultQueryContext) => {
    const parsedParams = notificationPushDeliveryIdParams.safeParse({
      notificationPushDeliveryId: c.req.param('notificationPushDeliveryId'),
    });
    if (!parsedParams.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedParams.error.flatten()
      );
    }

    try {
      const result = await service.getPushDeliveryDetail(
        Number(parsedParams.data.notificationPushDeliveryId)
      );
      if (!result) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_PUSH_DELIVERY_NOT_FOUND
        );
      }
      return c.json(result, 200);
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Push配信詳細の取得に失敗しました',
      });
    }
  };

  return { getScheduleResults, getPushDeliveryDetail };
}
