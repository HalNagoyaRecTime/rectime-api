import type { Context } from 'hono';
import type {
  AdminNotificationDetailDTO,
  NotificationCreateRequestDTO,
  NotificationPatchRequestDTO,
} from '../../application/dto/AdminNotificationDTO';
import { AdminNotificationCommandError } from '../../application/services/AdminNotificationCommandService';
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
  message: '通知の更新に失敗しました',
} as const satisfies ApiErrorDefinition<500>;

type AdminNotificationCommandContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createAdminNotificationCommandController(service: {
  createNotification: (
    actorUserId: number,
    request: NotificationCreateRequestDTO
  ) => Promise<{ notificationId: number; notificationScheduleId: number }>;
  patchNotification: (
    notificationId: number,
    request: NotificationPatchRequestDTO
  ) => Promise<AdminNotificationDetailDTO>;
  deleteNotification: (notificationId: number) => Promise<void>;
}) {
  return {
    async createNotification(
      c: AdminNotificationCommandContext,
      request: NotificationCreateRequestDTO
    ) {
      const actorUserId = c.get('authenticatedUserId');
      if (actorUserId === null)
        return errorResponse(c, CommonErrors.UNAUTHORIZED);

      try {
        const response = await service.createNotification(actorUserId, request);
        return c.json(response, 201);
      } catch (error) {
        if (error instanceof AdminNotificationCommandError) {
          switch (error.code) {
            case 'NOTIFICATION_IMPORTANCE_FORBIDDEN':
              return errorResponse(
                c,
                NotificationContractErrors.NOTIFICATION_IMPORTANCE_FORBIDDEN
              );
            case 'NOTIFICATION_AUDIENCE_NOT_FOUND':
              return errorResponse(
                c,
                NotificationContractErrors.NOTIFICATION_AUDIENCE_NOT_FOUND
              );
            default:
              return errorResponse(c, INTERNAL_ERROR);
          }
        }
        return errorResponse(c, INTERNAL_ERROR);
      }
    },

    async patchNotification(
      c: AdminNotificationCommandContext,
      notificationId: number,
      request: NotificationPatchRequestDTO
    ) {
      if (c.get('authenticatedUserId') === null) {
        return errorResponse(c, CommonErrors.UNAUTHORIZED);
      }
      try {
        return c.json(
          await service.patchNotification(notificationId, request),
          200
        );
      } catch (error) {
        return handlePatchError(c, error);
      }
    },

    async deleteNotification(
      c: AdminNotificationCommandContext,
      notificationId: number
    ) {
      if (c.get('authenticatedUserId') === null) {
        return errorResponse(c, CommonErrors.UNAUTHORIZED);
      }
      try {
        await service.deleteNotification(notificationId);
        return c.body(null, 204);
      } catch (error) {
        return handleDeleteError(c, error);
      }
    },
  };
}

function handlePatchError(c: AdminNotificationCommandContext, error: unknown) {
  if (!(error instanceof AdminNotificationCommandError)) {
    return errorResponse(c, INTERNAL_ERROR);
  }
  switch (error.code) {
    case 'NOTIFICATION_IMPORTANCE_FORBIDDEN':
      return errorResponse(
        c,
        NotificationContractErrors.NOTIFICATION_IMPORTANCE_FORBIDDEN
      );
    case 'NOTIFICATION_AUDIENCE_NOT_FOUND':
      return errorResponse(
        c,
        NotificationContractErrors.NOTIFICATION_AUDIENCE_NOT_FOUND
      );
    case 'ADMIN_NOTIFICATION_NOT_FOUND':
      return errorResponse(
        c,
        NotificationContractErrors.ADMIN_NOTIFICATION_NOT_FOUND
      );
    case 'NOTIFICATION_SCHEDULE_NOT_FOUND':
      return errorResponse(
        c,
        NotificationContractErrors.NOTIFICATION_SCHEDULE_NOT_FOUND
      );
    case 'NOTIFICATION_EDIT_NOT_ALLOWED':
      return errorResponse(
        c,
        NotificationContractErrors.NOTIFICATION_EDIT_NOT_ALLOWED
      );
    case 'NOTIFICATION_DELETE_NOT_ALLOWED':
      return errorResponse(c, INTERNAL_ERROR);
  }
}

function handleDeleteError(c: AdminNotificationCommandContext, error: unknown) {
  if (!(error instanceof AdminNotificationCommandError)) {
    return errorResponse(c, INTERNAL_ERROR);
  }
  switch (error.code) {
    case 'ADMIN_NOTIFICATION_NOT_FOUND':
      return errorResponse(
        c,
        NotificationContractErrors.ADMIN_NOTIFICATION_NOT_FOUND
      );
    case 'NOTIFICATION_DELETE_NOT_ALLOWED':
      return errorResponse(
        c,
        NotificationContractErrors.NOTIFICATION_DELETE_NOT_ALLOWED
      );
    default:
      return errorResponse(c, INTERNAL_ERROR);
  }
}
