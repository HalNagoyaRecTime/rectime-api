import { createRoute } from '@hono/zod-openapi';
import { MOBILE_NOTIFICATION_TYPES } from '../../../application/dto/MobileNotificationDTO';
import { eventVenueListResponseSchema } from '../eventVenues';
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
    venues: eventVenueListResponseSchema,
    start_time: z.string(),
    end_time: z.string(),
  })
  .openapi('MobileNotificationEvent');

export const mobileNotificationResponseSchema = z
  .object({
    notification_id: z.number().int(),
    notification_type: z.enum(MOBILE_NOTIFICATION_TYPES).openapi({
      description:
        'Mobile互換の通知種別。notification_generalはmanualとして返す。',
    }),
    title: z.string(),
    body: z.string(),
    scheduled_at: isoDateTimeSchema.openapi({
      description:
        '本人Recipientがある最新Scheduleのsend_at。同時刻はSchedule ID降順で選ぶ。',
    }),
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

export const mobileNotificationListQuery = paginationQuery(100, 50);

export const myNotificationListRoute = createRoute({
  method: 'get',
  path: '/me/notifications',
  tags: ['My notifications'],
  summary: '自分宛の通知一覧を取得する',
  description:
    '本人Recipientがある通知をNotification単位で返す。Token有無やPush配送状態に依存せず、scheduled_at降順、同時刻は選択Schedule ID降順。',
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
