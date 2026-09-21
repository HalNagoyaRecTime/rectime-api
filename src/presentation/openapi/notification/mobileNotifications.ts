import { createRoute } from '@hono/zod-openapi';
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

export const mobileNotificationEventSchema = z
  .object({
    event_id: z.number().int(),
    event_name: z.string(),
    venue: z.string(),
    start_time: z.string(),
    end_time: z.string(),
  })
  .openapi('MobileNotificationEvent');

export const mobileNotificationResponseSchema = z
  .object({
    notification_id: z.number().int(),
    notification_type: z.string(),
    title: z.string(),
    body: z.string(),
    scheduled_at: isoDateTimeSchema,
    related_event: mobileNotificationEventSchema.nullable(),
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

export const myNotificationListRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  tags: ['My notifications'],
  summary: '自分宛の通知一覧を取得する',
  security: bearerAuth,
  request: { query: paginationQuery(100, 50) },
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
