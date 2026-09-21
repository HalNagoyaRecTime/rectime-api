import type { Context } from 'hono';
import type { INotificationStopService } from '../../application/services/INotificationStopService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';

type NotificationStopContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createNotificationStopController(
  service: INotificationStopService
) {
  const stopSchedule = async (c: NotificationStopContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) return errorResponse(c, CommonErrors.UNAUTHORIZED);

    const scheduleId = Number(c.req.param('notificationScheduleId'));

    try {
      const result = await service.stopSchedule({
        scheduleId,
        stoppedByUserId: userId,
        reason: 'manual',
      });
      if (result.status === 'not_found') {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
        );
      }
      if (result.status === 'not_allowed') {
        return errorResponse(
          c,
          NotificationErrors.NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED
        );
      }
      return c.json(
        {
          notificationScheduleId: result.notificationScheduleId,
          status: 'stopped' as const,
        },
        200
      );
    } catch {
      return errorResponse(
        c,
        NotificationErrors.NOTIFICATION_SCHEDULE_FETCH_FAILED
      );
    }
  };

  return { stopSchedule };
}
