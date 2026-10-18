import type { Context } from 'hono';
import type { NotificationAudienceCountRequestDTO } from '../../application/dto/AdminNotificationDTO';
import {
  NotificationConfigError,
  type NotificationConfigService,
} from '../../application/services/NotificationConfigService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../errors/errorResponse';
import { NotificationContractErrors } from '../errors/notificationContractErrors';

const INTERNAL_ERROR = {
  status: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message: '通知設定の取得に失敗しました',
} as const satisfies ApiErrorDefinition<500>;

type NotificationConfigContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createNotificationConfigController(
  service: NotificationConfigService
) {
  return {
    getConfig(c: NotificationConfigContext) {
      if (c.get('authenticatedUserId') === null) {
        return errorResponse(c, CommonErrors.UNAUTHORIZED);
      }
      try {
        return c.json(service.getConfig(), 200);
      } catch {
        return errorResponse(c, INTERNAL_ERROR);
      }
    },

    async countAudience(
      c: NotificationConfigContext,
      request: NotificationAudienceCountRequestDTO
    ) {
      if (c.get('authenticatedUserId') === null) {
        return errorResponse(c, CommonErrors.UNAUTHORIZED);
      }
      try {
        return c.json(await service.countAudience(request), 200);
      } catch (error) {
        if (
          error instanceof NotificationConfigError &&
          error.code === 'NOTIFICATION_AUDIENCE_NOT_FOUND'
        ) {
          return errorResponse(
            c,
            NotificationContractErrors.NOTIFICATION_AUDIENCE_NOT_FOUND
          );
        }
        return errorResponse(c, INTERNAL_ERROR);
      }
    },
  };
}
