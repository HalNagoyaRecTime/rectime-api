import { createRoute, z } from '@hono/zod-openapi';

const json = (schema: z.ZodTypeAny, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

export const errorSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    details: z.unknown().optional(),
  })
  .openapi('Error');

const badRequest = json(errorSchema, '入力が不正');
const notFound = json(errorSchema, '対象が存在しない');
const conflict = json(errorSchema, '競合している');
const internalServerError = json(errorSchema, 'サーバー内部エラー');

const timestamp = z.string().openapi({ example: '2026-07-16 09:00:00' });

export const studentSchema = z
  .object({
    student_id: z.number().int(),
    display_name: z.string(),
    class_room_id: z.number().int(),
    attendance_number: z.number().int(),
    student_id_number: z.string(),
  })
  .openapi('Student');

const eventSchema = z
  .object({
    event_id: z.number().int(),
    user_id: z.number().int(),
    event_name: z.string(),
    rule_text: z.string(),
    venue: z.string(),
    // JSTの開始時刻。HHMM形式（例: 0930）。
    start_time: z.string().regex(/^\d{4}$/),
    // JSTの終了時刻。HHMM形式（例: 1030）。
    end_time: z.string().regex(/^\d{4}$/),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('Event');

const classRoomSchema = z
  .object({
    class_room_id: z.number().int(),
    class_code: z.string(),
    name: z.string(),
  })
  .openapi('ClassRoom');

const gatheringSpotSchema = z
  .object({
    gathering_spot_id: z.number().int(),
    gathering_spot_name: z.string(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('GatheringSpot');

const gatheringGroupSchema = z
  .object({
    gathering_group_id: z.number().int(),
    gathering_group_name: z.string(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('GatheringGroup');

const gatheringGroupMemberSchema = z
  .object({
    gathering_group_member_id: z.number().int(),
    gathering_group_id: z.number().int(),
    user_id: z.number().int(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('GatheringGroupMember');

const gatheringSchema = z
  .object({
    gathering_id: z.number().int(),
    gathering_group_id: z.number().int(),
    event_id: z.number().int(),
    gathering_spot_id: z.number().int(),
    gathering_time: z.string(),
    round: z.number().int(),
    created_at: timestamp,
    updated_at: timestamp,
    gathering_group_name: z.string(),
    event_name: z.string(),
    gathering_spot_name: z.string(),
  })
  .openapi('Gathering');

const notificationTargetUserSchema = z
  .object({
    user_id: z.number().int(),
    user_name: z.string(),
    is_live_active: z.union([z.literal(0), z.literal(1)]),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('NotificationTargetUser');

const firebaseTokenSchema = z
  .object({
    firebase_token_id: z.number().int(),
    user_id: z.number().int(),
    platform: z.union([z.literal(1), z.literal(2)]),
    fcm_token: z.string(),
    is_firebase_active: z.union([z.literal(0), z.literal(1)]),
    last_seen_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('FirebaseToken');

const firebaseTokenRegistrationSchema = z
  .object({
    user: notificationTargetUserSchema,
    firebaseToken: firebaseTokenSchema,
  })
  .openapi('RegisterFirebaseTokenResponse');

const notificationScheduleSchema = z
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
    created_at: timestamp,
    updated_at: timestamp,
  })
  .openapi('NotificationSchedule');

const fcmResultSchema = z
  .object({ success: z.literal(true), messageId: z.string() })
  .openapi('FcmNotificationResult');

const scheduledNotificationResultSchema = z
  .object({
    checkedEvents: z.number().int().nonnegative(),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .openapi('ScheduledNotificationResult');

const positivePathParam = (name: string, description: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .openapi({ param: { name, in: 'path' }, description, example: '1' });

export const studentIdParams = z.object({
  studentId: positivePathParam('studentId', '学生ID'),
});
export const eventIdParams = z.object({
  eventId: positivePathParam('eventId', 'イベントID'),
});
export const gatheringGroupIdParams = z.object({
  gatheringGroupId: positivePathParam('gatheringGroupId', '対象グループID'),
});
export const gatheringGroupMemberParams = z.object({
  gatheringGroupId: positivePathParam('gatheringGroupId', '対象グループID'),
  userId: positivePathParam('userId', '利用者ID'),
});

export const createGatheringSpotSchema = z.object({
  gatheringSpotName: z.string().trim().min(1),
});
export const createGatheringGroupSchema = z.object({
  gatheringGroupName: z.string().trim().min(1),
});
export const addGatheringGroupMemberSchema = z.object({
  userId: z.number().int().positive(),
});
export const createGatheringSchema = z.object({
  gatheringGroupId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  gatheringSpotId: z.number().int().positive(),
  gatheringTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^99:59$/)
    .optional()
    .openapi({
      description: 'HH:MM形式。99:59は集合時刻が未設定であることを表す。',
      example: '08:45',
    }),
  round: z.number().int().min(1).max(99).optional(),
});
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

export const eventListQuery = z.object({
  start_time: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'ヘルスチェック',
  responses: { 200: json(z.object({ status: z.literal('ok') }), '正常') },
});

export const rootRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['System'],
  summary: 'APIの概要を取得する',
  responses: { 200: json(z.record(z.unknown()), 'APIの概要') },
});

export const studentListRoute = createRoute({
  method: 'get',
  path: '/students',
  tags: ['Students'],
  summary: '学生一覧を取得する',
  responses: {
    200: json(z.array(studentSchema), '学生一覧'),
    500: internalServerError,
  },
});
export const studentDetailRoute = createRoute({
  method: 'get',
  path: '/students/{studentId}',
  tags: ['Students'],
  summary: '学生を取得する',
  request: { params: studentIdParams },
  responses: {
    200: json(studentSchema, '学生'),
    400: badRequest,
    404: notFound,
    500: internalServerError,
  },
});
export const eventListRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Events'],
  summary: 'イベント一覧を取得する',
  request: { query: eventListQuery },
  responses: {
    200: json(
      z.object({
        events: z.array(eventSchema),
        total: z.number().int(),
        limit: z.number().int(),
        offset: z.number().int(),
      }),
      'イベント一覧'
    ),
    400: badRequest,
    500: internalServerError,
  },
});
export const eventDetailRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを取得する',
  request: { params: eventIdParams },
  responses: {
    200: json(eventSchema, 'イベント'),
    400: badRequest,
    404: notFound,
    500: internalServerError,
  },
});
export const classListRoute = createRoute({
  method: 'get',
  path: '/classes',
  tags: ['Classes'],
  summary: 'クラス一覧を取得する',
  responses: {
    200: json(z.array(classRoomSchema), 'クラス一覧'),
    500: internalServerError,
  },
});
export const gatheringSpotListRoute = createRoute({
  method: 'get',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所一覧を取得する',
  responses: {
    200: json(z.array(gatheringSpotSchema), '集合場所一覧'),
    500: internalServerError,
  },
});
export const gatheringSpotCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所を作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringSpotSchema } },
      required: true,
    },
  },
  responses: {
    201: json(gatheringSpotSchema, '作成した集合場所'),
    400: badRequest,
    500: internalServerError,
  },
});
export const gatheringGroupListRoute = createRoute({
  method: 'get',
  path: '/gathering-groups',
  tags: ['Gathering groups'],
  summary: '対象グループ一覧を取得する',
  responses: {
    200: json(z.array(gatheringGroupSchema), '対象グループ一覧'),
    500: internalServerError,
  },
});
export const gatheringGroupCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-groups',
  tags: ['Gathering groups'],
  summary: '対象グループを作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringGroupSchema } },
      required: true,
    },
  },
  responses: {
    201: json(gatheringGroupSchema, '作成した対象グループ'),
    400: badRequest,
    500: internalServerError,
  },
});
export const gatheringGroupMemberListRoute = createRoute({
  method: 'get',
  path: '/gathering-groups/{gatheringGroupId}/members',
  tags: ['Gathering group members'],
  summary: '対象グループの所属者一覧を取得する',
  request: { params: gatheringGroupIdParams },
  responses: {
    200: json(z.array(gatheringGroupMemberSchema), '所属者一覧'),
    400: badRequest,
    404: notFound,
    500: internalServerError,
  },
});
export const gatheringGroupMemberCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-groups/{gatheringGroupId}/members',
  tags: ['Gathering group members'],
  summary: '対象グループへ所属者を追加する',
  request: {
    params: gatheringGroupIdParams,
    body: {
      content: {
        'application/json': { schema: addGatheringGroupMemberSchema },
      },
      required: true,
    },
  },
  responses: {
    201: json(gatheringGroupMemberSchema, '追加した所属情報'),
    400: badRequest,
    404: notFound,
    409: conflict,
    500: internalServerError,
  },
});
export const gatheringGroupMemberDeleteRoute = createRoute({
  method: 'delete',
  path: '/gathering-groups/{gatheringGroupId}/members/{userId}',
  tags: ['Gathering group members'],
  summary: '対象グループから所属者を削除する',
  request: { params: gatheringGroupMemberParams },
  responses: {
    204: { description: '削除成功' },
    400: badRequest,
    404: notFound,
    500: internalServerError,
  },
});
export const gatheringListRoute = createRoute({
  method: 'get',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定一覧を取得する',
  responses: {
    200: json(z.array(gatheringSchema), '集合予定一覧'),
    500: internalServerError,
  },
});
export const gatheringCreateRoute = createRoute({
  method: 'post',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定を作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringSchema } },
      required: true,
    },
  },
  responses: {
    201: json(gatheringSchema, '作成した集合予定'),
    400: badRequest,
    404: notFound,
    409: conflict,
    500: internalServerError,
  },
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
    200: json(firebaseTokenRegistrationSchema, '登録結果'),
    400: badRequest,
    404: notFound,
    500: internalServerError,
  },
});
export const notificationScheduleListRoute = createRoute({
  method: 'get',
  path: '/notification-schedules',
  tags: ['Notification schedules'],
  summary: '通知予定一覧を取得する',
  responses: {
    200: json(z.array(notificationScheduleSchema), '通知予定一覧'),
    500: internalServerError,
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
    201: json(notificationScheduleSchema, '作成した通知予定'),
    400: badRequest,
    404: notFound,
    500: internalServerError,
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
    200: json(fcmResultSchema, '送信結果'),
    400: badRequest,
    500: internalServerError,
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
    200: json(scheduledNotificationResultSchema, '実行結果'),
    400: badRequest,
    500: internalServerError,
  },
});
