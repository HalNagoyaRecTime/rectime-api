import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  isoDateTimeSchema,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  paginationQuery,
  positivePathParam,
  sendStatusSchema,
  timestampSchema,
  unauthorizedResponse,
  z,
} from '../../schemas';

export const manualNotificationAudienceRequestSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({
      type: z.literal('class_room'),
      classRoomId: z.number().int().positive(),
    }),
    z.object({
      type: z.literal('gathering'),
      gatheringId: z.number().int().positive(),
    }),
    z.object({
      type: z.literal('event_participants'),
      eventId: z.number().int().positive(),
    }),
  ])
  .openapi('ManualNotificationAudienceRequest');

export const manualNotificationAudienceResponseSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('all') }),
    z.object({
      type: z.literal('class_room'),
      class_room_id: z.number().int(),
    }),
    z.object({
      type: z.literal('gathering'),
      gathering_id: z.number().int(),
    }),
    z.object({
      type: z.literal('event_participants'),
      event_id: z.number().int(),
    }),
  ])
  .openapi('ManualNotificationAudience');

export const adminNotificationCreationResponseSchema = z
  .object({
    notification_id: z.number().int(),
    notification_type: z.literal('manual'),
    title: z.string(),
    body: z.string(),
    audience: manualNotificationAudienceResponseSchema,
    scheduled_at: isoDateTimeSchema,
    schedule_count: z.number().int(),
    send_status: z.literal('draft'),
    importance: z.literal(2),
    created_user_id: z.number().int(),
  })
  .openapi('AdminNotificationCreationResult');

export type AdminNotificationCreationResponseDTO = z.infer<
  typeof adminNotificationCreationResponseSchema
>;

export const notificationStatusSummarySchema = z
  .object({
    total: z.number().int(),
    draft: z.number().int(),
    sending: z.number().int(),
    sent: z.number().int(),
    failed: z.number().int(),
  })
  .openapi('NotificationStatusSummary');

export const adminNotificationAudienceSummarySchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('event_participants'),
      event_id: z.number().int(),
      recipient_count: z.number().int(),
    }),
    z.object({
      type: z.literal('resolved_recipients'),
      recipient_count: z.number().int(),
    }),
  ])
  .openapi('AdminNotificationAudienceSummary');

export const adminNotificationSummarySchema = z
  .object({
    notification_id: z.number().int(),
    notification_type: z.string(),
    title: z.string(),
    body: z.string(),
    scheduled_at: isoDateTimeSchema,
    related_event_id: z.number().int().nullable(),
    related_event_name: z.string().nullable(),
    created_user_id: z.number().int().nullable(),
    creator_name: z.string().nullable(),
    recipient_count: z.number().int(),
    audience: adminNotificationAudienceSummarySchema,
    delivery_summary: notificationStatusSummarySchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('AdminNotificationSummary');

export type AdminNotificationSummaryDTO = z.infer<
  typeof adminNotificationSummarySchema
>;

export const adminNotificationListResponseSchema = z
  .object({
    notifications: z.array(adminNotificationSummarySchema),
    ...paginationFields,
  })
  .openapi('AdminNotificationList');

export type AdminNotificationListResponseDTO = z.infer<
  typeof adminNotificationListResponseSchema
>;

export const adminNotificationIdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});

export const createManualNotificationSchema = z
  .object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    audience: manualNotificationAudienceRequestSchema,
    scheduledAt: isoDateTimeSchema,
  })
  .openapi('CreateManualNotificationRequest');

export const updateManualNotificationSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
    scheduledAt: isoDateTimeSchema.optional(),
    audience: manualNotificationAudienceRequestSchema.optional(),
  })
  .openapi('UpdateManualNotificationRequest');

export const adminNotificationListQuery = z
  .object({
    sendStatus: sendStatusSchema.optional(),
    eventId: z.coerce.number().int().positive().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .merge(paginationQuery(100, 50));

export const adminNotificationCreateRoute = createRoute({
  method: 'post',
  path: '/admin/notifications',
  tags: ['Admin notifications'],
  summary: '手動通知を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'application/json': { schema: createManualNotificationSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(adminNotificationCreationResponseSchema, '作成した通知'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationListRoute = createRoute({
  method: 'get',
  path: '/admin/notifications',
  tags: ['Admin notifications'],
  summary: '管理者通知一覧を取得する',
  security: bearerAuth,
  request: { query: adminNotificationListQuery },
  responses: {
    200: jsonResponse(adminNotificationListResponseSchema, '管理者通知一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '管理者通知を取得する',
  security: bearerAuth,
  request: { params: adminNotificationIdParams },
  responses: {
    200: jsonResponse(adminNotificationSummarySchema, '管理者通知'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationUpdateRoute = createRoute({
  method: 'put',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '管理者通知を更新する',
  security: bearerAuth,
  request: {
    params: adminNotificationIdParams,
    body: {
      content: {
        'application/json': { schema: updateManualNotificationSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminNotificationSummarySchema, '更新した管理者通知'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '管理者通知を削除する',
  security: bearerAuth,
  request: { params: adminNotificationIdParams },
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
