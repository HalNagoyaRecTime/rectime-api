import { createRoute } from '@hono/zod-openapi';
import { gatheringListResponseSchema } from './gatherings';
import { notificationScheduleResponseSchema } from './notifications';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  hhmmSchema,
  internalServerErrorResponse,
  isoDateTimeSchema,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const eventResponseSchema = z
  .object({
    event_id: z.number().int(),
    event_name: z.string(),
    rule_text: z.string().nullable(),
    venue: z.string(),
    start_time: hhmmSchema,
    end_time: hhmmSchema,
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Event');

export type EventResponseDTO = z.infer<typeof eventResponseSchema>;

export const eventListResponseSchema = z
  .object({
    events: z.array(eventResponseSchema),
    ...paginationFields,
  })
  .openapi('EventList');

export type EventListResponseDTO = z.infer<typeof eventListResponseSchema>;

export const eventScheduleResultSchema = z
  .object({
    event: eventResponseSchema,
    notification_enabled: z.boolean(),
    notification_schedules: z.array(notificationScheduleResponseSchema),
  })
  .openapi('EventScheduleResult');

export type EventScheduleResultDTO = z.infer<typeof eventScheduleResultSchema>;

export const eventNotificationSummarySchema = z
  .object({
    event_id: z.number().int(),
    scheduled_at: isoDateTimeSchema.nullable(),
    total: z.number().int(),
    draft: z.number().int(),
    sending: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
  })
  .openapi('EventNotificationSummary');

export type EventNotificationSummaryDTO = z.infer<
  typeof eventNotificationSummarySchema
>;

export const eventIdParams = z.object({
  eventId: positivePathParam('eventId', 'イベントID'),
});

export const eventListQuery = z.object({
  start_time: hhmmSchema.optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const eventWriteSchema = z
  .object({
    event_name: z.string().trim().min(1).max(100),
    rule_text: z.string().trim().max(1000).nullable().optional(),
    venue: z.string().trim().min(1).max(100),
    start_time: hhmmSchema,
    end_time: hhmmSchema,
  })
  .openapi('EventWriteRequest');

export const eventUpdateSchema = eventWriteSchema
  .extend({
    notification_enabled: z.boolean().optional(),
  })
  .openapi('EventUpdateRequest');

export const eventPatchSchema = z
  .object({
    event_name: z.string().trim().min(1).max(100).optional(),
    rule_text: z.string().trim().max(1000).nullable().optional(),
    venue: z.string().trim().min(1).max(100).optional(),
    start_time: hhmmSchema.optional(),
    end_time: hhmmSchema.optional(),
    notification_enabled: z.boolean().optional(),
  })
  .openapi('EventPatchRequest');

export const eventScheduleUpdateSchema = z
  .object({
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    notificationEnabled: z.boolean(),
  })
  .openapi('EventScheduleUpdateRequest');

export const eventListRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Events'],
  summary: 'イベント一覧を取得する',
  security: bearerAuth,
  request: { query: eventListQuery },
  responses: {
    200: jsonResponse(eventListResponseSchema, 'イベント一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});

export const eventDetailRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを取得する',
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    200: jsonResponse(eventResponseSchema, 'イベント'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const eventGatheringListRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/gatherings',
  tags: ['Events'],
  summary: 'イベントに紐づく集合予定一覧を取得する',
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    200: jsonResponse(gatheringListResponseSchema, '集合予定一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const eventCreateRoute = createRoute({
  method: 'post',
  path: '/events',
  tags: ['Events'],
  summary: 'イベントを作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: eventWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(eventResponseSchema, '作成したイベント'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const eventUpdateRoute = createRoute({
  method: 'put',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを更新する',
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: { 'application/json': { schema: eventUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(eventScheduleResultSchema, '更新したイベントと通知予定'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const eventPatchRoute = createRoute({
  method: 'patch',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを部分更新する',
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: { 'application/json': { schema: eventPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(eventScheduleResultSchema, '更新したイベントと通知予定'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const eventDeleteRoute = createRoute({
  method: 'delete',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを削除する',
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const eventScheduleUpdateRoute = createRoute({
  method: 'put',
  path: '/events/{eventId}/schedule',
  tags: ['Events'],
  summary: 'イベントの実施時間と通知設定を更新する',
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: { 'application/json': { schema: eventScheduleUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(eventScheduleResultSchema, '更新したイベントと通知予定'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const eventNotificationSummaryRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}/notification-summary',
  tags: ['Events'],
  summary: 'イベントの通知配信状況を取得する',
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    200: jsonResponse(eventNotificationSummarySchema, '通知配信状況'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
