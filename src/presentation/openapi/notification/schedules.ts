import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  positivePathParam,
  z,
} from '../schemas';
import {
  notificationBadRequestResponse,
  notificationResendConflictResponse,
  notificationScheduleCancelConflictResponse,
  notificationScheduleNotFoundResponse,
  notificationScheduleStopConflictResponse,
  notificationStaffForbiddenResponse,
  notificationUnauthorizedResponse,
} from './errors';
import {
  notificationDateRangeQuery,
  notificationDeliveryInputSchema,
  notificationRecipientResultSchema,
  notificationResultsQuery,
  notificationScheduleDetailSchema,
  notificationScheduleListItemSchema,
  notificationScheduleResultsPaginationSchema,
} from './commonSchemas';
import { notificationCreateResponseSchema } from './admin';

export const notificationScheduleListResponseSchema = z
  .object({
    items: z.array(notificationScheduleListItemSchema),
  })
  .strict()
  .openapi('NotificationScheduleList');

export const notificationScheduleResultsResponseSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    recipients: z
      .object({
        items: z.array(notificationRecipientResultSchema),
        pagination: notificationScheduleResultsPaginationSchema,
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationScheduleResults');

export const notificationStopResponseSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    status: z.literal('stopped'),
  })
  .strict()
  .openapi('NotificationStopResponse');

export const notificationResendRequestSchema = z
  .object({ delivery: notificationDeliveryInputSchema })
  .strict()
  .openapi('NotificationResendRequest');

export const notificationScheduleIdParams = z.object({
  notificationScheduleId: positivePathParam(
    'notificationScheduleId',
    '通知スケジュールID'
  ),
});

export const notificationScheduleListRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules',
  tags: ['Notification schedules'],
  summary: '通知スケジュール一覧を取得する',
  security: bearerAuth,
  request: { query: notificationDateRangeQuery },
  responses: {
    200: jsonResponse(
      notificationScheduleListResponseSchema,
      'スケジュール一覧'
    ),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules/{notificationScheduleId}',
  tags: ['Notification schedules'],
  summary: '通知スケジュール詳細を取得する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    200: jsonResponse(notificationScheduleDetailSchema, 'スケジュール詳細'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationScheduleNotFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleResultsRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules/{notificationScheduleId}/results',
  tags: ['Notification schedules'],
  summary: '通知スケジュールの受信者単位の配信結果を取得する',
  security: bearerAuth,
  request: {
    params: notificationScheduleIdParams,
    query: notificationResultsQuery,
  },
  responses: {
    200: jsonResponse(notificationScheduleResultsResponseSchema, '配信結果'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationScheduleNotFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/notifications/schedules/{notificationScheduleId}',
  tags: ['Notification schedules'],
  summary: '未開始の通知スケジュールを削除する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    204: noContentResponse,
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationScheduleNotFoundResponse,
    409: notificationScheduleCancelConflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleResendRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/schedules/{notificationScheduleId}/resend',
  tags: ['Notification schedules'],
  summary: '同じ通知に新しい通知スケジュールを作成する',
  security: bearerAuth,
  request: {
    params: notificationScheduleIdParams,
    body: {
      content: {
        'application/json': { schema: notificationResendRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(notificationCreateResponseSchema, '再送結果'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationScheduleNotFoundResponse,
    409: notificationResendConflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleStopRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/schedules/{notificationScheduleId}/stop',
  tags: ['Notification schedules'],
  summary: '通知スケジュールを停止する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    200: jsonResponse(notificationStopResponseSchema, '停止結果'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationStaffForbiddenResponse,
    404: notificationScheduleNotFoundResponse,
    409: notificationScheduleStopConflictResponse,
    500: internalServerErrorResponse,
  },
});
