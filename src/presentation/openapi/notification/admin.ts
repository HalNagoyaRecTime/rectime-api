import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  internalServerErrorResponse,
  isoDateTimeSchema,
  jsonResponse,
  noContentResponse,
  paginationFields,
  positivePathParam,
  z,
} from '../schemas';
import {
  notificationBadRequestResponse,
  notificationConflictResponse,
  notificationForbiddenResponse,
  notificationNotFoundResponse,
  notificationUnauthorizedResponse,
} from './errors';
import {
  notificationAudienceInputSchema,
  notificationContentSchema,
  notificationCreationSchema,
  notificationDeliveryInputSchema,
  notificationImportanceSchema,
  notificationPaginationQuery,
  notificationScheduleSummarySchema,
} from './commonSchemas';

export const adminNotificationDetailSchema = z
  .object({
    notificationId: z.number().int().positive(),
    content: notificationContentSchema,
    importance: notificationImportanceSchema,
    creation: notificationCreationSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    schedules: z.array(notificationScheduleSummarySchema),
  })
  .strict()
  .openapi('AdminNotificationDetail');

export const adminNotificationListResponseSchema = z
  .object({
    notifications: z.array(adminNotificationDetailSchema),
    ...paginationFields,
  })
  .strict()
  .openapi('AdminNotificationList');

export const notificationCreateRequestSchema = z
  .object({
    content: notificationContentSchema,
    audience: notificationAudienceInputSchema,
    delivery: notificationDeliveryInputSchema,
    importance: notificationImportanceSchema,
  })
  .strict()
  .openapi('NotificationCreateRequest');

export const notificationCreateResponseSchema = z
  .object({
    notificationId: z.number().int().positive(),
    notificationScheduleId: z.number().int().positive(),
  })
  .strict()
  .openapi('NotificationCreateResponse');

const notificationContentPatchBlockSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: '少なくともtitleまたはbodyを指定してください',
  });

export const notificationContentPatchSchema = z
  .object({
    push: notificationContentPatchBlockSchema.optional(),
    detail: notificationContentPatchBlockSchema.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: '少なくともpushまたはdetailを指定してください',
  })
  .openapi('NotificationContentPatch');

export const notificationSchedulePatchSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    audience: notificationAudienceInputSchema.optional(),
    delivery: notificationDeliveryInputSchema.optional(),
  })
  .strict()
  .refine(
    value => value.audience !== undefined || value.delivery !== undefined,
    { message: 'audienceまたはdeliveryを指定してください' }
  )
  .openapi('NotificationSchedulePatch');

export const notificationPatchRequestSchema = z
  .object({
    content: notificationContentPatchSchema.optional(),
    importance: notificationImportanceSchema.optional(),
    schedule: notificationSchedulePatchSchema.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, {
    message: '少なくとも1項目を指定してください',
  })
  .openapi('NotificationPatchRequest');

export const notificationConfigResponseSchema = z
  .object({
    importance: z
      .object({
        default: z.literal('normal'),
        options: z.array(notificationImportanceSchema),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationConfig');

export const notificationAudienceCountRequestSchema = z
  .object({ audience: notificationAudienceInputSchema })
  .strict()
  .openapi('NotificationAudienceCountRequest');

export const notificationAudienceCountResponseSchema = z
  .object({ recipientCount: z.number().int().nonnegative() })
  .strict()
  .openapi('NotificationAudienceCountResponse');

export const adminNotificationIdParams = z.object({
  notificationId: positivePathParam('notificationId', '通知ID'),
});

export const adminNotificationListRoute = createRoute({
  method: 'get',
  path: '/admin/notifications',
  tags: ['Admin notifications'],
  summary: '通知一覧を取得する',
  security: bearerAuth,
  request: { query: notificationPaginationQuery },
  responses: {
    200: jsonResponse(adminNotificationListResponseSchema, '通知一覧'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationDetailRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '通知詳細を取得する',
  security: bearerAuth,
  request: { params: adminNotificationIdParams },
  responses: {
    200: jsonResponse(adminNotificationDetailSchema, '通知詳細'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    404: notificationNotFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationCreateRoute = createRoute({
  method: 'post',
  path: '/admin/notifications',
  tags: ['Admin notifications'],
  summary: '通知を作成する',
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
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    404: notificationNotFoundResponse,
    409: notificationConflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationPatchRoute = createRoute({
  method: 'patch',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '通知を編集する',
  security: bearerAuth,
  request: {
    params: adminNotificationIdParams,
    body: {
      content: {
        'application/json': { schema: notificationPatchRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminNotificationDetailSchema, '編集後の通知詳細'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    404: notificationNotFoundResponse,
    409: notificationConflictResponse,
    500: internalServerErrorResponse,
  },
});

export const adminNotificationDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/notifications/{notificationId}',
  tags: ['Admin notifications'],
  summary: '通知を削除する',
  security: bearerAuth,
  request: { params: adminNotificationIdParams },
  responses: {
    204: noContentResponse,
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    404: notificationNotFoundResponse,
    409: notificationConflictResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationConfigRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/config',
  tags: ['Admin notifications'],
  summary: '通知設定を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(notificationConfigResponseSchema, '通知設定'),
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const notificationAudienceCountRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/audience-count',
  tags: ['Admin notifications'],
  summary: '通知対象の受信者数を取得する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'application/json': {
          schema: notificationAudienceCountRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(notificationAudienceCountResponseSchema, '受信者数'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: notificationForbiddenResponse,
    500: internalServerErrorResponse,
  },
});
