import { createRoute } from '@hono/zod-openapi';
import { notificationTypeSchema } from './commonSchemas';
import {
  badRequestResponse,
  bearerAuth,
  internalServerErrorResponse,
  isoDateTimeSchema,
  jsonResponse,
  notFoundResponse,
  paginationFields,
  paginationQuery,
  positivePathParam,
  unauthorizedResponse,
  z,
} from '../schemas';

export const mobileNotificationResponseSchema = z
  .object({
    notification_id: z.number().int(),
    notification_type: notificationTypeSchema,
    title: z.string(),
    body: z.string(),
    scheduled_at: isoDateTimeSchema.openapi({
      description:
        '認証UserがRecipientになったScheduleだけを対象にsend_at降順、同時刻はnotification_schedule_id降順で選んだ1件のsend_at。',
    }),
  })
  .openapi('MobileNotification');

export const mobileNotificationListResponseSchema = z
  .object({
    notifications: z.array(mobileNotificationResponseSchema),
    ...paginationFields,
  })
  .openapi('MobileNotificationList');

export const mobileNotificationIdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});

export const mobileNotificationListQuery = paginationQuery(100, 50).extend({
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional()
    .default(0)
    .openapi({ param: { name: 'offset', in: 'query' }, example: 0 }),
});

export const myNotificationListRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  tags: ['My notifications'],
  summary: '自分宛の通知一覧を取得する',
  description:
    '本人Recipientがあるnotification_general通知をNotification単位で返す。Token有無やPush配送状態に依存せず、本人RecipientがあるScheduleのうちsend_at降順、同時刻はnotification_schedule_id降順で選んだsend_atをscheduled_atとして返す。',
  security: bearerAuth,
  request: { query: mobileNotificationListQuery },
  responses: {
    200: jsonResponse(mobileNotificationListResponseSchema, '通知一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});

export const myNotificationDetailRoute = createRoute({
  method: 'get',
  path: '/me/notifications/{notificationId}',
  tags: ['My notifications'],
  summary: '自分宛の通知を取得する',
  security: bearerAuth,
  request: { params: mobileNotificationIdParams },
  responses: {
    200: jsonResponse(mobileNotificationResponseSchema, '通知'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
