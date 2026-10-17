import type { Context } from 'hono';
import type { INotificationScheduleActionService } from '../../application/services/INotificationScheduleActionService';
import type { NotificationResendRequestDTO } from '../../application/dto/NotificationScheduleDTO';
import { NotificationScheduleActionError } from '../../application/services/NotificationScheduleActionService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import type { ContainerVariables } from '../middleware/diContainer';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationContractErrors } from '../errors/notificationContractErrors';

type ActionContext = Context<{
  Bindings: Env;
  Variables: AuthenticationVariables & AuthVariables & ContainerVariables;
}>;
const INTERNAL_ERROR = {
  status: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message: '通知スケジュールの操作に失敗しました',
} as const;

export function createNotificationScheduleActionController(
  service: INotificationScheduleActionService
) {
  return {
    async resendSchedule(
      c: ActionContext,
      scheduleId: number,
      request: NotificationResendRequestDTO
    ) {
      const actor = c.get('authenticatedUserId');
      if (actor === null) return errorResponse(c, CommonErrors.UNAUTHORIZED);
      try {
        return c.json(
          await service.resendSchedule(scheduleId, actor, request),
          201
        );
      } catch (error) {
        if (error instanceof NotificationScheduleActionError) {
          if (error.code === 'NOTIFICATION_SCHEDULE_NOT_FOUND')
            return errorResponse(
              c,
              NotificationContractErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
            );
          if (error.code === 'NOTIFICATION_RESEND_NOT_ALLOWED')
            return errorResponse(
              c,
              NotificationContractErrors.NOTIFICATION_RESEND_NOT_ALLOWED
            );
        }
        return errorResponse(c, INTERNAL_ERROR);
      }
    },
    async cancelSchedule(c: ActionContext, scheduleId: number) {
      if (c.get('authenticatedUserId') === null)
        return errorResponse(c, CommonErrors.UNAUTHORIZED);
      try {
        await service.cancelSchedule(scheduleId);
        return c.body(null, 204);
      } catch (error) {
        if (error instanceof NotificationScheduleActionError) {
          if (error.code === 'NOTIFICATION_SCHEDULE_NOT_FOUND')
            return errorResponse(
              c,
              NotificationContractErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
            );
          if (error.code === 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED')
            return errorResponse(
              c,
              NotificationContractErrors.NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED
            );
        }
        return errorResponse(c, INTERNAL_ERROR);
      }
    },
  };
}
