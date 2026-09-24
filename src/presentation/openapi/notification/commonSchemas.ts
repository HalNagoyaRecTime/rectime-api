import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_CREATION_METHODS,
  NOTIFICATION_DELIVERY_TYPES,
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_STOP_REASONS,
  NOTIFICATION_TARGET_AUDIENCE_TYPES,
  NOTIFICATION_TYPES,
} from '../../../domain/entities/Notification';
import { isoDateTimeSchema, utcDateTimeSchema, z } from '../schemas';

export const notificationStatusSchemas = {
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

export const notificationTypeSchema = z
  .enum(NOTIFICATION_TYPES)
  .openapi('NotificationType');

export const notificationSourceTypeSchema = z
  .enum(NOTIFICATION_SOURCE_TYPES)
  .openapi('NotificationSourceType');

const notificationContentBlockSchema = z
  .object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
  })
  .strict();

export const notificationContentPushSchema =
  notificationContentBlockSchema.openapi('NotificationContentPush');

export const notificationContentDetailSchema =
  notificationContentBlockSchema.openapi('NotificationContentDetail');

export const notificationContentSchema = z
  .object({
    push: notificationContentPushSchema,
    detail: notificationContentDetailSchema,
  })
  .strict()
  .openapi('NotificationContent');

export const notificationContentPushOnlySchema = z
  .object({ push: notificationContentPushSchema })
  .strict()
  .openapi('NotificationContentPushOnly');

export const notificationUserReferenceSchema = z
  .object({
    userId: z.number().int().positive(),
    userName: z.string(),
  })
  .strict()
  .openapi('NotificationUserReference');

export const notificationAudienceInputItemSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal(NOTIFICATION_AUDIENCE_TYPES[0]) }).strict(),
    z
      .object({
        type: z.enum(NOTIFICATION_TARGET_AUDIENCE_TYPES),
        targetId: z.number().int().positive(),
      })
      .strict(),
  ])
  .openapi('NotificationAudienceInputItem');

export const notificationAudienceInputSchema = z
  .object({
    items: z.array(notificationAudienceInputItemSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();

    value.items.forEach((item, index) => {
      const key =
        item.type === 'all' ? item.type : `${item.type}:${item.targetId}`;
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '同じ通知対象を重複して指定できません',
          path: ['items', index],
        });
      }
      seen.add(key);
    });

    if (
      value.items.length > 1 &&
      value.items.some(item => item.type === 'all')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'allは他の通知対象と同時に指定できません',
        path: ['items'],
      });
    }
  })
  .openapi('NotificationAudienceInput');

export const notificationAudienceItemSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal(NOTIFICATION_AUDIENCE_TYPES[0]) }).strict(),
    z
      .object({
        type: z.enum(NOTIFICATION_TARGET_AUDIENCE_TYPES),
        targetId: z.number().int().positive(),
        label: z.string().nullable(),
      })
      .strict(),
  ])
  .openapi('NotificationAudienceItem');

export const notificationAudienceSchema = z
  .object({
    items: z.array(notificationAudienceItemSchema).min(1),
  })
  .strict()
  .openapi('NotificationAudience');

export const notificationDeliveryInputSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal(NOTIFICATION_DELIVERY_TYPES[0]),
        sendAt: z.null(),
      })
      .strict(),
    z
      .object({
        type: z.literal(NOTIFICATION_DELIVERY_TYPES[1]),
        sendAt: isoDateTimeSchema,
      })
      .strict(),
  ])
  .openapi('NotificationDeliveryInput');

export const notificationCreationSchema = z
  .discriminatedUnion('method', [
    z
      .object({
        method: z.literal(NOTIFICATION_CREATION_METHODS[0]),
        user: notificationUserReferenceSchema.nullable(),
        source: z.null(),
      })
      .strict(),
    z
      .object({
        method: z.literal(NOTIFICATION_CREATION_METHODS[1]),
        user: z.null(),
        source: z
          .object({
            type: notificationSourceTypeSchema,
            id: z.number().int().positive(),
            label: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
  ])
  .openapi('NotificationCreation');

export const notificationStopSchema = z
  .object({
    reason: z.enum(NOTIFICATION_STOP_REASONS),
    stoppedAt: utcDateTimeSchema,
    stoppedBy: notificationUserReferenceSchema.nullable(),
  })
  .strict()
  .openapi('NotificationStop');

export const notificationRecipientResolutionSchema = z
  .object({
    status: z.enum(['pending', 'resolved']),
    resolvedCount: z.number().int().nonnegative(),
  })
  .strict()
  .openapi('NotificationRecipientResolution');

export const notificationRecipientPushSummarySchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    successCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    noPushTargetCount: z.number().int().nonnegative(),
  })
  .strict()
  .openapi('NotificationRecipientPushSummary');

export const notificationScheduleAudienceSchema = notificationAudienceSchema
  .extend({
    recipientResolution: notificationRecipientResolutionSchema,
  })
  .strict()
  .openapi('NotificationScheduleAudience');

export const notificationScheduleSummarySchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    sendAt: utcDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    scheduledBy: notificationUserReferenceSchema.nullable(),
    createdAt: utcDateTimeSchema,
    audience: notificationScheduleAudienceSchema,
    recipientPushSummary: notificationRecipientPushSummarySchema,
  })
  .strict()
  .openapi('NotificationScheduleSummary');

export const adminNotificationScheduleListItemSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    sendAt: utcDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    scheduledBy: notificationUserReferenceSchema.nullable(),
    createdAt: utcDateTimeSchema,
    audience: notificationScheduleAudienceSchema,
    recipientPushSummary: notificationRecipientPushSummarySchema,
  })
  .strict()
  .openapi('AdminNotificationScheduleListItem');

export const notificationScheduleListItemSchema = z
  .object({
    notificationId: z.number().int().positive(),
    notificationScheduleId: z.number().int().positive(),
    content: notificationContentPushOnlySchema,
    importance: notificationImportanceSchema,
    sendAt: utcDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    creation: notificationCreationSchema,
  })
  .strict()
  .openapi('NotificationScheduleListItem');

export const notificationAudienceProgressSchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    resolvedCount: z.number().int().nonnegative(),
  })
  .strict()
  .openapi('NotificationAudienceProgress');

export const notificationRecipientProgressSchema = z
  .object({
    count: z.number().int().nonnegative(),
    status: z.enum(['pending', 'resolved']),
  })
  .strict()
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
  .strict()
  .openapi('NotificationDeliveryProgress');

export const notificationScheduleDetailSchema = z
  .object({
    notificationId: z.number().int().positive(),
    notificationScheduleId: z.number().int().positive(),
    content: notificationContentPushOnlySchema,
    importance: notificationImportanceSchema,
    sendAt: utcDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    creation: notificationCreationSchema,
    audienceProgress: notificationAudienceProgressSchema,
    recipientProgress: notificationRecipientProgressSchema,
    deliveryProgress: notificationDeliveryProgressSchema,
  })
  .strict()
  .openapi('NotificationScheduleDetail');

export const notificationPushDeliveryDetailSchema = z
  .object({
    notificationPushDeliveryId: z.number().int().positive(),
    notificationRecipientId: z.number().int().positive(),
    firebaseTokenId: z.number().int().positive().nullable(),
    platform: z.enum(['ios', 'android']),
    status: notificationStatusSchemas.pushDelivery,
    attemptCount: z.number().int().nonnegative(),
    firstAttemptAt: utcDateTimeSchema.nullable(),
    lastAttemptAt: utcDateTimeSchema.nullable(),
    nextRetryAt: utcDateTimeSchema.nullable(),
    sentAt: utcDateTimeSchema.nullable(),
    failedReason: z.string().nullable(),
    fcmMessageId: z.string().nullable(),
  })
  .strict()
  .openapi('NotificationPushDeliveryDetail');

export const notificationRecipientResultDeliverySchema = z
  .object({
    notificationPushDeliveryId: z.number().int().positive(),
    platform: z.enum(['ios', 'android']),
    status: notificationStatusSchemas.pushDelivery,
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: utcDateTimeSchema.nullable(),
    sentAt: utcDateTimeSchema.nullable(),
  })
  .strict()
  .openapi('NotificationRecipientResultDelivery');

export const notificationRecipientResultSchema = z
  .object({
    notificationRecipientId: z.number().int().positive(),
    user: notificationUserReferenceSchema,
    deliveries: z.array(notificationRecipientResultDeliverySchema),
  })
  .strict()
  .openapi('NotificationRecipientResult');

export const notificationScheduleResultsPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()
  .openapi('NotificationScheduleResultsPagination');

export const notificationDateRangeQuery = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.from === undefined) !== (value.to === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fromとtoはセットで指定してください',
      });
    }

    if (
      value.from !== undefined &&
      value.to !== undefined &&
      Date.parse(value.from) > Date.parse(value.to)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'fromはto以前の日時を指定してください',
        path: ['from'],
      });
    }
  })
  .openapi('NotificationDateRangeQuery');

export const notificationResultsQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .openapi('NotificationResultsQuery');
