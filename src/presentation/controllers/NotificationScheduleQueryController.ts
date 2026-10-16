import type { Context } from 'hono';
import type { INotificationScheduleQueryService } from '../../application/services/INotificationScheduleQueryService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import {
  notificationDateRangeQuery,
  notificationScheduleIdParams,
} from '../openapi/notification';

type NotificationScheduleQueryContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createNotificationScheduleQueryController(
  service: INotificationScheduleQueryService
) {
  const getNotificationSchedules = async (
    c: NotificationScheduleQueryContext
  ) => {
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
      return c.json(
        await service.getNotificationSchedules(parsedQuery.data),
        200
      );
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'スケジュール一覧の取得に失敗しました',
      });
    }
  };

  const getNotificationScheduleById = async (
    c: NotificationScheduleQueryContext
  ) => {
    const parsedParams = notificationScheduleIdParams.safeParse({
      notificationScheduleId: c.req.param('notificationScheduleId'),
    });
    if (!parsedParams.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedParams.error.flatten()
      );
    }

    try {
      const schedule = await service.getNotificationScheduleById(
        Number(parsedParams.data.notificationScheduleId)
      );
      if (!schedule) {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
        );
      }
      return c.json(schedule, 200);
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'スケジュール詳細の取得に失敗しました',
      });
    }
  };

  return { getNotificationSchedules, getNotificationScheduleById };
}
