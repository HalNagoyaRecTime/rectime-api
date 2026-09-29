import { jsonResponse, z } from '../schemas';

export const notificationBadRequestErrorCodeSchema =
  z.literal('VALIDATION_ERROR');
export const notificationUnauthorizedErrorCodeSchema =
  z.literal('UNAUTHORIZED');

export const notificationStaffForbiddenErrorCodeSchema =
  z.literal('STAFF_REQUIRED');
export const notificationImportanceForbiddenErrorCodeSchema = z.literal(
  'NOTIFICATION_IMPORTANCE_FORBIDDEN'
);
export const notificationForbiddenErrorCodeSchema = z.enum([
  'STAFF_REQUIRED',
  'NOTIFICATION_IMPORTANCE_FORBIDDEN',
]);
export const adminNotificationPatchNotFoundErrorCodeSchema = z.enum([
  'ADMIN_NOTIFICATION_NOT_FOUND',
  'NOTIFICATION_SCHEDULE_NOT_FOUND',
  'NOTIFICATION_AUDIENCE_NOT_FOUND',
]);
export const adminNotificationNotFoundErrorCodeSchema = z.literal(
  'ADMIN_NOTIFICATION_NOT_FOUND'
);
export const notificationScheduleNotFoundErrorCodeSchema = z.literal(
  'NOTIFICATION_SCHEDULE_NOT_FOUND'
);
export const notificationAudienceNotFoundErrorCodeSchema = z.literal(
  'NOTIFICATION_AUDIENCE_NOT_FOUND'
);
export const notificationPushDeliveryNotFoundErrorCodeSchema = z.literal(
  'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND'
);
export const notificationNotFoundErrorCodeSchema = z.enum([
  'ADMIN_NOTIFICATION_NOT_FOUND',
  'NOTIFICATION_SCHEDULE_NOT_FOUND',
  'NOTIFICATION_AUDIENCE_NOT_FOUND',
  'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND',
]);

export const notificationEditConflictErrorCodeSchema = z.literal(
  'NOTIFICATION_EDIT_NOT_ALLOWED'
);
export const notificationDeleteConflictErrorCodeSchema = z.literal(
  'NOTIFICATION_DELETE_NOT_ALLOWED'
);
export const notificationScheduleCancelConflictErrorCodeSchema = z.literal(
  'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED'
);
export const notificationScheduleStopConflictErrorCodeSchema = z.literal(
  'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'
);
export const notificationResendConflictErrorCodeSchema = z.literal(
  'NOTIFICATION_RESEND_NOT_ALLOWED'
);
export const notificationConflictErrorCodeSchema = z.enum([
  'NOTIFICATION_EDIT_NOT_ALLOWED',
  'NOTIFICATION_DELETE_NOT_ALLOWED',
  'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
  'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED',
  'NOTIFICATION_RESEND_NOT_ALLOWED',
]);

export const notificationErrorCodeSchema = z.union([
  notificationBadRequestErrorCodeSchema,
  notificationUnauthorizedErrorCodeSchema,
  notificationForbiddenErrorCodeSchema,
  notificationNotFoundErrorCodeSchema,
  notificationConflictErrorCodeSchema,
]);

const notificationErrorBody = <CodeSchema extends z.ZodTypeAny>(
  codeSchema: CodeSchema,
  name: string
) =>
  z
    .object({
      error: z
        .object({
          code: codeSchema,
          message: z.string(),
          details: z.any().optional(),
        })
        .strict(),
    })
    .strict()
    .openapi(name);

export const notificationBadRequestErrorResponseSchema = notificationErrorBody(
  notificationBadRequestErrorCodeSchema,
  'NotificationBadRequestError'
);
export const notificationUnauthorizedErrorResponseSchema =
  notificationErrorBody(
    notificationUnauthorizedErrorCodeSchema,
    'NotificationUnauthorizedError'
  );
export const notificationForbiddenErrorResponseSchema = notificationErrorBody(
  notificationForbiddenErrorCodeSchema,
  'NotificationForbiddenError'
);

export const notificationStaffForbiddenErrorResponseSchema =
  notificationErrorBody(
    notificationStaffForbiddenErrorCodeSchema,
    'NotificationStaffForbiddenError'
  );
export const notificationImportanceForbiddenErrorResponseSchema =
  notificationErrorBody(
    notificationImportanceForbiddenErrorCodeSchema,
    'NotificationImportanceForbiddenError'
  );

export const adminNotificationNotFoundErrorResponseSchema =
  notificationErrorBody(
    adminNotificationNotFoundErrorCodeSchema,
    'AdminNotificationNotFoundError'
  );
export const adminNotificationPatchNotFoundErrorResponseSchema =
  notificationErrorBody(
    adminNotificationPatchNotFoundErrorCodeSchema,
    'AdminNotificationPatchNotFoundError'
  );
export const notificationScheduleNotFoundErrorResponseSchema =
  notificationErrorBody(
    notificationScheduleNotFoundErrorCodeSchema,
    'NotificationScheduleNotFoundError'
  );
export const notificationAudienceNotFoundErrorResponseSchema =
  notificationErrorBody(
    notificationAudienceNotFoundErrorCodeSchema,
    'NotificationAudienceNotFoundError'
  );
export const notificationPushDeliveryNotFoundErrorResponseSchema =
  notificationErrorBody(
    notificationPushDeliveryNotFoundErrorCodeSchema,
    'NotificationPushDeliveryNotFoundError'
  );

export const notificationEditConflictErrorResponseSchema =
  notificationErrorBody(
    notificationEditConflictErrorCodeSchema,
    'NotificationEditConflictError'
  );
export const notificationDeleteConflictErrorResponseSchema =
  notificationErrorBody(
    notificationDeleteConflictErrorCodeSchema,
    'NotificationDeleteConflictError'
  );
export const notificationScheduleCancelConflictErrorResponseSchema =
  notificationErrorBody(
    notificationScheduleCancelConflictErrorCodeSchema,
    'NotificationScheduleCancelConflictError'
  );
export const notificationScheduleStopConflictErrorResponseSchema =
  notificationErrorBody(
    notificationScheduleStopConflictErrorCodeSchema,
    'NotificationScheduleStopConflictError'
  );
export const notificationResendConflictErrorResponseSchema =
  notificationErrorBody(
    notificationResendConflictErrorCodeSchema,
    'NotificationResendConflictError'
  );

export const notificationBadRequestResponse = jsonResponse(
  notificationBadRequestErrorResponseSchema,
  '入力が不正'
);
export const notificationUnauthorizedResponse = jsonResponse(
  notificationUnauthorizedErrorResponseSchema,
  '認証が必要'
);
export const notificationForbiddenResponse = jsonResponse(
  notificationForbiddenErrorResponseSchema,
  '操作が許可されていない'
);

export const notificationStaffForbiddenResponse = jsonResponse(
  notificationStaffForbiddenErrorResponseSchema,
  'スタッフ権限が必要'
);
export const adminNotificationPatchNotFoundResponse = jsonResponse(
  adminNotificationPatchNotFoundErrorResponseSchema,
  '通知更新対象が存在しない'
);
export const adminNotificationNotFoundResponse = jsonResponse(
  adminNotificationNotFoundErrorResponseSchema,
  '通知が存在しない'
);
export const notificationScheduleNotFoundResponse = jsonResponse(
  notificationScheduleNotFoundErrorResponseSchema,
  '通知スケジュールが存在しない'
);
export const notificationAudienceNotFoundResponse = jsonResponse(
  notificationAudienceNotFoundErrorResponseSchema,
  '通知対象が存在しない'
);
export const notificationPushDeliveryNotFoundResponse = jsonResponse(
  notificationPushDeliveryNotFoundErrorResponseSchema,
  'Push配信が存在しない'
);
export const notificationImportanceForbiddenResponse = jsonResponse(
  notificationImportanceForbiddenErrorResponseSchema,
  '通知重要度を利用できない'
);
export const notificationEditConflictResponse = jsonResponse(
  notificationEditConflictErrorResponseSchema,
  '通知を編集できない'
);
export const notificationDeleteConflictResponse = jsonResponse(
  notificationDeleteConflictErrorResponseSchema,
  '通知を削除できない'
);
export const notificationScheduleCancelConflictResponse = jsonResponse(
  notificationScheduleCancelConflictErrorResponseSchema,
  '通知スケジュールを削除できない'
);
export const notificationScheduleStopConflictResponse = jsonResponse(
  notificationScheduleStopConflictErrorResponseSchema,
  '通知スケジュールを停止できない'
);
export const notificationResendConflictResponse = jsonResponse(
  notificationResendConflictErrorResponseSchema,
  '通知スケジュールを再送できない'
);
