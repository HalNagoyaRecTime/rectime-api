import { jsonResponse, z } from '../schemas';

export const notificationBadRequestErrorCodeSchema =
  z.literal('VALIDATION_ERROR');
export const notificationUnauthorizedErrorCodeSchema =
  z.literal('UNAUTHORIZED');
export const notificationForbiddenErrorCodeSchema = z.enum([
  'STAFF_REQUIRED',
  'NOTIFICATION_IMPORTANCE_FORBIDDEN',
]);
export const notificationNotFoundErrorCodeSchema = z.enum([
  'ADMIN_NOTIFICATION_NOT_FOUND',
  'NOTIFICATION_SCHEDULE_NOT_FOUND',
  'NOTIFICATION_AUDIENCE_NOT_FOUND',
  'FIREBASE_TOKEN_NOT_FOUND',
  'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND',
]);
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

export const notificationBadRequestErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: notificationBadRequestErrorCodeSchema,
        message: z.string(),
        details: z.any().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationBadRequestError');

export const notificationUnauthorizedErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: notificationUnauthorizedErrorCodeSchema,
        message: z.string(),
        details: z.any().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationUnauthorizedError');

export const notificationForbiddenErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: notificationForbiddenErrorCodeSchema,
        message: z.string(),
        details: z.any().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationForbiddenError');

export const notificationNotFoundErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: notificationNotFoundErrorCodeSchema,
        message: z.string(),
        details: z.any().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationNotFoundError');

export const notificationConflictErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: notificationConflictErrorCodeSchema,
        message: z.string(),
        details: z.any().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationConflictError');

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
export const notificationNotFoundResponse = jsonResponse(
  notificationNotFoundErrorResponseSchema,
  '対象が存在しない'
);
export const notificationConflictResponse = jsonResponse(
  notificationConflictErrorResponseSchema,
  '競合している'
);
