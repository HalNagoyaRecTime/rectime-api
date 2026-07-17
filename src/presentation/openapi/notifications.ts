import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  timestampSchema,
  z,
} from './schemas';

export const notificationTargetUserResponseSchema = z
  .object({
    user_id: z.number().int(),
    user_name: z.string(),
    is_live_active: z.number().int().min(0).max(1),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('NotificationTargetUser');

export const firebaseTokenResponseSchema = z
  .object({
    firebase_token_id: z.number().int(),
    user_id: z.number().int(),
    platform: z.union([z.literal(1), z.literal(2)]),
    fcm_token: z.string(),
    is_firebase_active: z.number().int().min(0).max(1),
    last_seen_at: timestampSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('FirebaseToken');

export const firebaseTokenRegistrationResponseSchema = z
  .object({
    user: notificationTargetUserResponseSchema,
    firebaseToken: firebaseTokenResponseSchema,
  })
  .openapi('RegisterFirebaseTokenResponse');

export type FirebaseTokenRegistrationResponseDTO = z.infer<
  typeof firebaseTokenRegistrationResponseSchema
>;

export const notificationScheduleResponseSchema = z
  .object({
    notification_send_schedule_id: z.number().int(),
    user_id: z.number().int(),
    event_id: z.number().int(),
    gathering_group_id: z.number().int(),
    notification_id: z.number().int(),
    importance: z.number().int().min(1).max(4),
    notification_type: z.string(),
    title: z.string(),
    body: z.string(),
    send_status: z.enum(['draft', 'sending', 'sent', 'failed']),
    fcm_message_id: z.string().nullable(),
    failed_reason: z.string().nullable(),
    send_at: z.string().datetime({ offset: true }),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('NotificationSchedule');

export type NotificationScheduleResponseDTO = z.infer<
  typeof notificationScheduleResponseSchema
>;

export const notificationScheduleListResponseSchema = z
  .array(notificationScheduleResponseSchema)
  .openapi('NotificationScheduleList');

export type NotificationScheduleListResponseDTO = z.infer<
  typeof notificationScheduleListResponseSchema
>;

export const fcmNotificationResponseSchema = z
  .object({ success: z.literal(true), messageId: z.string() })
  .openapi('FcmNotificationResult');

export type FcmNotificationResponseDTO = z.infer<
  typeof fcmNotificationResponseSchema
>;

export const scheduledNotificationResponseSchema = z
  .object({
    checkedEvents: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .openapi('ScheduledNotificationResult');

export type ScheduledNotificationResponseDTO = z.infer<
  typeof scheduledNotificationResponseSchema
>;

export const registerFirebaseTokenSchema = z
  .object({
    studentNumber: z.string().min(1),
    platform: z.union([z.literal(1), z.literal(2)]),
    fcmToken: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
  })
  .refine(value => value.fcmToken || value.token, {
    message: 'fcmToken or token is required',
    path: ['fcmToken'],
  });
export const createNotificationScheduleSchema = z.object({
  userId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  gatheringGroupId: z.number().int().positive(),
  notificationId: z.number().int().positive(),
  importance: z.number().int().min(1).max(4).optional(),
  // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  sendAt: z.string().datetime({ offset: true }),
});
export const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export const runScheduledNotificationsSchema = z.object({
  now: z.string().datetime({ offset: true }).optional(),
});

export const firebaseTokenCreateRoute = createRoute({
  method: 'post',
  path: '/firebase-tokens',
  tags: ['Firebase tokens'],
  summary: 'Firebaseトークンを登録する',
  request: {
    body: {
      content: { 'application/json': { schema: registerFirebaseTokenSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(firebaseTokenRegistrationResponseSchema, '登録結果'),
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationScheduleListRoute = createRoute({
  method: 'get',
  path: '/notification-schedules',
  tags: ['Notification schedules'],
  summary: '通知予定一覧を取得する',
  responses: {
    200: jsonResponse(notificationScheduleListResponseSchema, '通知予定一覧'),
    500: internalServerErrorResponse,
  },
});
export const notificationScheduleCreateRoute = createRoute({
  method: 'post',
  path: '/notification-schedules',
  tags: ['Notification schedules'],
  summary: '通知予定を作成する',
  request: {
    body: {
      content: {
        'application/json': { schema: createNotificationScheduleSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(notificationScheduleResponseSchema, '作成した通知予定'),
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
export const testNotificationRoute = createRoute({
  method: 'post',
  path: '/notifications/test',
  tags: ['Notifications'],
  summary: 'テスト通知を送信する',
  request: {
    body: {
      content: { 'application/json': { schema: testNotificationSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(fcmNotificationResponseSchema, '送信結果'),
    400: badRequestResponse,
    500: internalServerErrorResponse,
  },
});
export const runScheduledNotificationsRoute = createRoute({
  method: 'post',
  path: '/notifications/schedule/run',
  tags: ['Notification schedules'],
  summary: '送信対象の通知を実行する',
  request: {
    body: {
      content: {
        'application/json': { schema: runScheduledNotificationsSchema },
      },
      required: false,
    },
  },
  responses: {
    200: jsonResponse(scheduledNotificationResponseSchema, '実行結果'),
    400: badRequestResponse,
    500: internalServerErrorResponse,
  },
});
