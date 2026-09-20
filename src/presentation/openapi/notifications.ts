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
} from './schemas';

// --- 通知予定 ---

export const notificationScheduleResponseSchema = z
  .object({
    notification_schedule_id: z.number().int(),
    created_user_id: z.number().int().nullable(),
    event_id: z.number().int().nullable(),
    notification_id: z.number().int(),
    firebase_token_id: z.number().int(),
    importance: z.number().int(),
    notification_type: z.string(),
    title: z.string(),
    body: z.string(),
    send_status: sendStatusSchema,
    fcm_message_id: z.string().nullable(),
    failed_reason: z.string().nullable(),
    send_at: isoDateTimeSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('NotificationSchedule');

// --- Firebaseトークン ---

export const firebaseTokenRegistrationResponseSchema = z
  .object({
    firebase_token_id: z.number().int(),
    user_id: z.number().int(),
    platform: z.enum(['ios', 'android']),
    is_firebase_active: z.boolean(),
    last_seen_at: timestampSchema,
  })
  .openapi('RegisterFirebaseTokenResponse');

export type FirebaseTokenRegistrationResponseDTO = z.infer<
  typeof firebaseTokenRegistrationResponseSchema
>;

// --- 管理者通知 ---

/** 送信対象の指定。HTTPリクエストではキャメルケースで受け取る。 */
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

/** 送信対象の指定。応答ではスネークケースで返す。 */
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

// --- 利用者向け通知 ---

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

export type MobileNotificationResponseDTO = z.infer<
  typeof mobileNotificationResponseSchema
>;

export const mobileNotificationListResponseSchema = z
  .object({
    notifications: z.array(mobileNotificationResponseSchema),
    ...paginationFields,
  })
  .openapi('MobileNotificationList');

export type MobileNotificationListResponseDTO = z.infer<
  typeof mobileNotificationListResponseSchema
>;

// --- FCM ---

export const fcmNotificationResponseSchema = z
  .object({ success: z.literal(true), messageId: z.string() })
  .openapi('FcmNotificationResult');

export type FcmNotificationResponseDTO = z.infer<
  typeof fcmNotificationResponseSchema
>;

// --- パラメータ・リクエスト本文 ---

export const adminNotificationIdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});
export const mobileNotificationIdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});

export const registerFirebaseTokenSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.enum(['ios', 'android']),
  })
  .openapi('RegisterFirebaseTokenRequest');

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

export const testNotificationSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
  })
  .openapi('TestNotificationRequest');

// --- ルート定義 ---

export const firebaseTokenCreateRoute = createRoute({
  method: 'post',
  path: '/firebase-tokens',
  tags: ['Firebase tokens'],
  summary: 'Firebaseトークンを登録する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: registerFirebaseTokenSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(firebaseTokenRegistrationResponseSchema, '登録結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

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
    // 取得系でも共通のエラーハンドラを経由するため、409を返す可能性がある。
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

export const testNotificationRoute = createRoute({
  method: 'post',
  path: '/notifications/test',
  tags: ['Notifications'],
  summary: 'テスト通知を送信する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: testNotificationSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(fcmNotificationResponseSchema, '送信結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});
