import { createRoute } from '@hono/zod-openapi';
import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_CREATION_METHODS,
  NOTIFICATION_DELIVERY_TYPES,
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_STOP_REASONS,
  NOTIFICATION_TARGET_AUDIENCE_TYPES,
} from '../../domain/entities/NotificationV2';
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
  unauthorizedResponse,
  z,
} from './schemas';

const notificationV2ErrorCodes = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'STAFF_REQUIRED',
  'ADMIN_NOTIFICATION_NOT_FOUND',
  'NOTIFICATION_SCHEDULE_NOT_FOUND',
  'NOTIFICATION_AUDIENCE_NOT_FOUND',
  'FIREBASE_TOKEN_NOT_FOUND',
  'NOTIFICATION_IMPORTANCE_FORBIDDEN',
  'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND',
  'NOTIFICATION_EDIT_NOT_ALLOWED',
  'NOTIFICATION_DELETE_NOT_ALLOWED',
  'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
  'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED',
  'NOTIFICATION_RESEND_NOT_ALLOWED',
] as const;

export const notificationV2ErrorCodeSchema = z.enum(notificationV2ErrorCodes);

export const notificationV2StatusSchemas = {
  schedule: z
    .enum(NOTIFICATION_SCHEDULE_STATUSES)
    .openapi('NotificationScheduleStatus'),
  pushDelivery: z
    .enum(NOTIFICATION_PUSH_DELIVERY_STATUSES)
    .openapi('NotificationPushDeliveryStatus'),
} as const;

export const notificationImportanceSchema = z
  .enum(NOTIFICATION_IMPORTANCE_LEVELS)
  .openapi('NotificationImportance');

export const notificationContentSchema = z
  .object({
    push: z.object({
      title: z.string().trim().min(1),
      body: z.string().trim().min(1),
    }),
    detail: z.object({
      title: z.string().trim().min(1),
      body: z.string().trim().min(1),
    }),
  })
  .openapi('NotificationContent');

export const notificationUserReferenceSchema = z
  .object({
    userId: z.number().int().positive(),
    userName: z.string(),
  })
  .openapi('NotificationUserReference');

export const notificationAudienceItemSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal(NOTIFICATION_AUDIENCE_TYPES[0]),
      label: z.null().optional(),
    }),
    z.object({
      type: z.enum(NOTIFICATION_TARGET_AUDIENCE_TYPES),
      targetId: z.number().int().positive(),
      label: z.string().nullable().optional(),
    }),
  ])
  .openapi('NotificationAudienceItem');

export const notificationAudienceSchema = z
  .object({
    items: z.array(notificationAudienceItemSchema).min(1),
  })
  .openapi('NotificationAudience');

export const notificationDeliveryInputSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal(NOTIFICATION_DELIVERY_TYPES[0]),
      sendAt: z.null(),
    }),
    z.object({
      type: z.literal(NOTIFICATION_DELIVERY_TYPES[1]),
      sendAt: isoDateTimeSchema,
    }),
  ])
  .openapi('NotificationDeliveryInput');

export const notificationCreationSchema = z
  .discriminatedUnion('method', [
    z.object({
      method: z.literal(NOTIFICATION_CREATION_METHODS[0]),
      user: notificationUserReferenceSchema.nullable(),
      source: z.null(),
    }),
    z.object({
      method: z.literal(NOTIFICATION_CREATION_METHODS[1]),
      user: z.null(),
      source: z.object({
        type: z.literal('gathering'),
        id: z.number().int().positive(),
        label: z.string().nullable(),
      }),
    }),
  ])
  .openapi('NotificationCreation');

export const notificationStopSchema = z
  .object({
    reason: z.enum(NOTIFICATION_STOP_REASONS),
    stoppedAt: isoDateTimeSchema,
    stoppedBy: notificationUserReferenceSchema.nullable(),
  })
  .openapi('NotificationStop');

export const notificationRecipientResolutionSchema = z
  .object({
    status: z.enum(['pending', 'resolved']),
    resolvedCount: z.number().int().nonnegative(),
  })
  .openapi('NotificationRecipientResolution');

export const notificationRecipientPushSummarySchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    successCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    noPushTargetCount: z.number().int().nonnegative(),
  })
  .openapi('NotificationRecipientPushSummary');

export const notificationScheduleAudienceSchema = notificationAudienceSchema
  .extend({
    recipientResolution: notificationRecipientResolutionSchema,
  })
  .openapi('NotificationScheduleAudience');

export const notificationScheduleSummarySchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    sendAt: isoDateTimeSchema,
    status: notificationV2StatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    scheduledBy: notificationUserReferenceSchema.nullable(),
    createdAt: isoDateTimeSchema,
    audience: notificationScheduleAudienceSchema,
    recipientPushSummary: notificationRecipientPushSummarySchema,
  })
  .openapi('NotificationScheduleSummaryV2');

export const notificationAudienceProgressSchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    resolvedCount: z.number().int().nonnegative(),
  })
  .openapi('NotificationAudienceProgress');

export const notificationRecipientProgressSchema = z
  .object({
    count: z.number().int().nonnegative(),
    status: z.enum(['pending', 'resolved']),
  })
  .openapi('NotificationRecipientProgress');

export const notificationDeliveryProgressSchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    sendingCount: z.number().int().nonnegative(),
    retryWaitCount: z.number().int().nonnegative(),
    sentCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    stoppedCount: z.number().int().nonnegative(),
  })
  .openapi('NotificationDeliveryProgress');

export const notificationScheduleProgressSchema = z
  .object({
    audienceProgress: notificationAudienceProgressSchema,
    recipientProgress: notificationRecipientProgressSchema,
    deliveryProgress: notificationDeliveryProgressSchema,
  })
  .openapi('NotificationScheduleProgress');

export const notificationScheduleDetailSchema =
  notificationScheduleSummarySchema
    .extend({
      updatedAt: isoDateTimeSchema,
      progress: notificationScheduleProgressSchema,
    })
    .openapi('NotificationScheduleDetailV2');

export const notificationPushDeliveryDetailSchema = z
  .object({
    notificationPushDeliveryId: z.number().int().positive(),
    notificationRecipientId: z.number().int().positive(),
    firebaseTokenId: z.number().int().positive().nullable(),
    platform: z.enum(['ios', 'android']),
    status: notificationV2StatusSchemas.pushDelivery,
    attemptCount: z.number().int().nonnegative(),
    firstAttemptAt: isoDateTimeSchema.nullable(),
    lastAttemptAt: isoDateTimeSchema.nullable(),
    nextRetryAt: isoDateTimeSchema.nullable(),
    sentAt: isoDateTimeSchema.nullable(),
    failedReason: z.string().nullable(),
    fcmMessageId: z.string().nullable(),
  })
  .openapi('NotificationPushDeliveryDetail');

export const adminNotificationDetailV2Schema = z
  .object({
    notificationId: z.number().int().positive(),
    content: notificationContentSchema,
    importance: notificationImportanceSchema,
    creation: notificationCreationSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    schedules: z.array(notificationScheduleSummarySchema),
  })
  .openapi('AdminNotificationDetailV2');

export const adminNotificationListV2ResponseSchema = z
  .object({
    notifications: z.array(adminNotificationDetailV2Schema),
    ...paginationFields,
  })
  .openapi('AdminNotificationListV2');

export const notificationCreateRequestSchema = z
  .object({
    content: notificationContentSchema,
    audience: notificationAudienceSchema,
    delivery: notificationDeliveryInputSchema,
    importance: notificationImportanceSchema,
  })
  .openapi('NotificationCreateRequest');

export const notificationCreateResponseSchema = z
  .object({
    notificationId: z.number().int().positive(),
    notificationScheduleId: z.number().int().positive(),
  })
  .openapi('NotificationCreateResponse');

export const notificationPatchRequestSchema = z
  .object({
    content: notificationContentSchema.optional(),
    audience: notificationAudienceSchema.optional(),
    delivery: notificationDeliveryInputSchema.optional(),
    importance: notificationImportanceSchema.optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: '少なくとも1項目を指定してください',
  })
  .openapi('NotificationPatchRequest');

export const notificationConfigResponseSchema = z
  .object({
    importance: z.object({
      default: z.literal('normal'),
      options: z.array(notificationImportanceSchema),
    }),
  })
  .openapi('NotificationConfig');

export const notificationAudienceCountRequestSchema = z
  .object({ audience: notificationAudienceSchema })
  .openapi('NotificationAudienceCountRequest');

export const notificationAudienceCountResponseSchema = z
  .object({ recipientCount: z.number().int().nonnegative() })
  .openapi('NotificationAudienceCountResponse');

export const notificationScheduleListResponseSchema = z
  .object({
    schedules: z.array(notificationScheduleSummarySchema),
    ...paginationFields,
  })
  .openapi('NotificationScheduleListV2');

export const notificationScheduleResultsResponseSchema = z
  .object({
    results: z.array(notificationPushDeliveryDetailSchema),
    ...paginationFields,
  })
  .openapi('NotificationScheduleResults');

export const notificationStopResponseSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    status: z.literal('stopped'),
  })
  .openapi('NotificationStopResponse');

export const adminNotificationV2IdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});

export const notificationScheduleIdParams = z.object({
  notificationScheduleId: positivePathParam(
    'notificationScheduleId',
    '通知スケジュールID'
  ),
});

export const notificationPushDeliveryIdParams = z.object({
  notificationPushDeliveryId: positivePathParam(
    'notificationPushDeliveryId',
    'Push配信ID'
  ),
});

export const firebaseTokenIdParams = z.object({
  firebaseTokenId: positivePathParam('firebaseTokenId', 'FirebaseトークンID'),
});

export const notificationV2PaginationQuery = paginationQuery(100, 50);

export const adminNotificationV2ListRoute = createRoute({
  method: 'get',
  path: '/admin/notifications',
  tags: ['Admin notifications v2'],
  summary: '通知基盤v2の通知一覧を取得する',
  security: bearerAuth,
  request: { query: notificationV2PaginationQuery },
  responses: {
    200: jsonResponse(adminNotificationListV2ResponseSchema, '通知一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationV2DetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications v2'],
  summary: '通知基盤v2の通知詳細を取得する',
  security: bearerAuth,
  request: { params: adminNotificationV2IdParams },
  responses: {
    200: jsonResponse(adminNotificationDetailV2Schema, '通知詳細'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationV2CreateRoute = createRoute({
  method: 'post',
  path: '/admin/notifications',
  tags: ['Admin notifications v2'],
  summary: '通知基盤v2の通知を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'application/json': { schema: notificationCreateRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(notificationCreateResponseSchema, '作成結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationV2PatchRoute = createRoute({
  method: 'patch',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications v2'],
  summary: '通知基盤v2の通知を編集する',
  security: bearerAuth,
  request: {
    params: adminNotificationV2IdParams,
    body: {
      content: {
        'application/json': { schema: notificationPatchRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminNotificationDetailV2Schema, '編集後の通知詳細'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationV2DeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications v2'],
  summary: '通知基盤v2の通知を削除する',
  security: bearerAuth,
  request: { params: adminNotificationV2IdParams },
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

export const notificationConfigRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/config',
  tags: ['Admin notifications v2'],
  summary: '通知設定を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(notificationConfigResponseSchema, '通知設定'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationAudienceCountRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/audience-count',
  tags: ['Admin notifications v2'],
  summary: '通知対象の受信者数を取得する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'application/json': { schema: notificationAudienceCountRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(notificationAudienceCountResponseSchema, '受信者数'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleListRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules',
  tags: ['Notification schedules v2'],
  summary: '通知スケジュール一覧を取得する',
  security: bearerAuth,
  request: { query: notificationV2PaginationQuery },
  responses: {
    200: jsonResponse(
      notificationScheduleListResponseSchema,
      'スケジュール一覧'
    ),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules/{notificationScheduleId}',
  tags: ['Notification schedules v2'],
  summary: '通知スケジュール詳細を取得する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    200: jsonResponse(notificationScheduleDetailSchema, 'スケジュール詳細'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleResultsRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/schedules/{notificationScheduleId}/results',
  tags: ['Notification schedules v2'],
  summary: '通知スケジュールの配信結果を取得する',
  security: bearerAuth,
  request: {
    params: notificationScheduleIdParams,
    query: notificationV2PaginationQuery,
  },
  responses: {
    200: jsonResponse(notificationScheduleResultsResponseSchema, '配信結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/notifications/schedules/{notificationScheduleId}',
  tags: ['Notification schedules v2'],
  summary: '未開始の通知スケジュールを削除する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    204: noContentResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleResendRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/schedules/{notificationScheduleId}/resend',
  tags: ['Notification schedules v2'],
  summary: '通知スケジュールを再送する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    201: jsonResponse(notificationCreateResponseSchema, '再送結果'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleStopRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/schedules/{notificationScheduleId}/stop',
  tags: ['Notification schedules v2'],
  summary: '通知スケジュールを停止する',
  security: bearerAuth,
  request: { params: notificationScheduleIdParams },
  responses: {
    200: jsonResponse(notificationStopResponseSchema, '停止結果'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationPushDeliveryDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/push-deliveries/{notificationPushDeliveryId}',
  tags: ['Push deliveries v2'],
  summary: 'Push配信詳細を取得する',
  security: bearerAuth,
  request: { params: notificationPushDeliveryIdParams },
  responses: {
    200: jsonResponse(notificationPushDeliveryDetailSchema, 'Push配信詳細'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const firebaseTokenDeleteRoute = createRoute({
  method: 'delete',
  path: '/firebase-tokens/{firebaseTokenId}',
  tags: ['Firebase tokens v2'],
  summary: 'Firebaseトークンを削除する',
  security: bearerAuth,
  request: { params: firebaseTokenIdParams },
  responses: {
    204: noContentResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
