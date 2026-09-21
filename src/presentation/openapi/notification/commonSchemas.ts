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
import { isoDateTimeSchema, paginationQuery, z } from '../schemas';

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

export const notificationContentSchema = z
  .object({
    push: z
      .object({
        title: z.string().trim().min(1),
        body: z.string().trim().min(1),
      })
      .strict(),
    detail: z
      .object({
        title: z.string().trim().min(1),
        body: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationContent');

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
    stoppedAt: isoDateTimeSchema,
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
    sendAt: isoDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    scheduledBy: notificationUserReferenceSchema.nullable(),
    createdAt: isoDateTimeSchema,
    audience: notificationScheduleAudienceSchema,
    recipientPushSummary: notificationRecipientPushSummarySchema,
  })
  .strict()
  .openapi('NotificationScheduleSummary');

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

export const notificationScheduleProgressSchema = z
  .object({
    audienceProgress: notificationAudienceProgressSchema,
    recipientProgress: notificationRecipientProgressSchema,
    deliveryProgress: notificationDeliveryProgressSchema,
  })
  .strict()
  .openapi('NotificationScheduleProgress');

export const notificationScheduleMonitorListItemSchema = z
  .object({
    notificationScheduleId: z.number().int().positive(),
    notificationId: z.number().int().positive(),
    content: notificationContentSchema,
    creation: notificationCreationSchema,
    sendAt: isoDateTimeSchema,
    status: notificationStatusSchemas.schedule,
    stop: notificationStopSchema.nullable(),
    scheduledBy: notificationUserReferenceSchema.nullable(),
    createdAt: isoDateTimeSchema,
    startedAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    audience: notificationScheduleAudienceSchema,
    recipientPushSummary: notificationRecipientPushSummarySchema,
    progress: notificationScheduleProgressSchema,
  })
  .strict()
  .openapi('NotificationScheduleMonitorListItem');

export const notificationScheduleDetailSchema =
  notificationScheduleMonitorListItemSchema
    .extend({
      updatedAt: isoDateTimeSchema,
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
    firstAttemptAt: isoDateTimeSchema.nullable(),
    lastAttemptAt: isoDateTimeSchema.nullable(),
    nextRetryAt: isoDateTimeSchema.nullable(),
    sentAt: isoDateTimeSchema.nullable(),
    failedReason: z.string().nullable(),
    fcmMessageId: z.string().nullable(),
  })
  .strict()
  .openapi('NotificationPushDeliveryDetail');

export const notificationRecipientResultSchema = z
  .object({
    notificationRecipientId: z.number().int().positive(),
    user: notificationUserReferenceSchema,
    push: z
      .object({
        status: z.enum(['success', 'failed', 'no_push_target']),
        successCount: z.number().int().nonnegative(),
        failedCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .openapi('NotificationRecipientResult');

export const notificationPaginationQuery = paginationQuery(100, 50);
