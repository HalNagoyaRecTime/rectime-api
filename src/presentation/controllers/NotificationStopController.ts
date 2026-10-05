import type { Context } from 'hono';
import type { INotificationStopService } from '../../application/services/INotificationStopService';
import { NotificationStopError } from '../../application/services/NotificationStopService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import type { ContainerVariables } from '../middleware/diContainer';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationContractErrors } from '../errors/notificationContractErrors';

type StopContext = Context<{
  Bindings: Env;
  Variables: AuthenticationVariables & AuthVariables & ContainerVariables;
}>;

export function createNotificationStopController(
  service: INotificationStopService
) {
  return {
    async stopSchedule(c: StopContext, scheduleId: number) {
      const actor = c.get('authenticatedUserId');
      if (actor === null) return errorResponse(c, CommonErrors.UNAUTHORIZED);
      try {
        return c.json(
          await service.stopSchedule({
            scheduleId,
            reason: 'manual',
            stoppedByUserId: actor,
          }),
          200
        );
      } catch (error) {
        if (error instanceof NotificationStopError) {
          if (error.code === 'NOTIFICATION_SCHEDULE_NOT_FOUND')
            return errorResponse(
              c,
              NotificationContractErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
            );
          return errorResponse(
            c,
            NotificationContractErrors.NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED
          );
        }
        return errorResponse(c, {
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          message: '通知スケジュールの停止に失敗しました',
        });
      }
    },
  };
}
