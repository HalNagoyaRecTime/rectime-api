import { describe, expectTypeOf, it } from 'vitest';
import type {
  AdminNotificationListItemDTO,
  NotificationAudienceDTO,
  NotificationAudienceInputDTO,
  NotificationAudienceInputItemDTO,
  NotificationAudienceItemDTO,
  NotificationContentDTO,
  NotificationContentDetailDTO,
  NotificationContentPatchDTO,
  NotificationContentPushDTO,
  NotificationContentPushOnlyDTO,
  NotificationCreationDTO,
  NotificationDeliveryInputDTO,
  NotificationScheduleStopDTO,
  NotificationUserReferenceDTO,
} from '../../../src/application/dto/AdminNotificationDTO';
import type {
  AdminNotificationScheduleListItemDTO,
  NotificationAudienceProgressDTO,
  NotificationDeliveryProgressDTO,
  NotificationRecipientProgressDTO,
  NotificationRecipientPushSummaryDTO,
  NotificationRecipientResolutionDTO,
  NotificationRecipientResultDeliveryDTO,
  NotificationResendResponseDTO,
  NotificationScheduleAudienceDTO,
  NotificationScheduleListItemDTO,
  NotificationScheduleResultsPaginationDTO,
  NotificationScheduleSummaryDTO,
} from '../../../src/application/dto/NotificationScheduleDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  adminNotificationListItemSchema,
  adminNotificationScheduleListItemSchema,
  notificationAudienceInputItemSchema,
  notificationAudienceInputSchema,
  notificationAudienceItemSchema,
  notificationAudienceSchema,
  notificationAudienceProgressSchema,
  notificationContentDetailSchema,
  notificationContentPatchSchema,
  notificationContentPushOnlySchema,
  notificationContentPushSchema,
  notificationContentSchema,
  notificationCreateResponseSchema,
  notificationCreationSchema,
  notificationDeliveryInputSchema,
  notificationDeliveryProgressSchema,
  notificationRecipientProgressSchema,
  notificationRecipientPushSummarySchema,
  notificationRecipientResolutionSchema,
  notificationRecipientResultDeliverySchema,
  notificationScheduleAudienceSchema,
  notificationScheduleListItemSchema,
  notificationScheduleResultsPaginationSchema,
  notificationScheduleSummarySchema,
  notificationStopSchema,
  notificationUserReferenceSchema,
} from '../../../src/presentation/openapi/notification';

describe('通知契約のApplication DTOとOpenAPI schemaの全体パリティ', () => {
  it('共通のcontent・audience・creationが一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationContentPushSchema>
    >().toEqualTypeOf<NotificationContentPushDTO>();
    expectTypeOf<
      z.infer<typeof notificationContentDetailSchema>
    >().toEqualTypeOf<NotificationContentDetailDTO>();
    expectTypeOf<
      z.infer<typeof notificationContentSchema>
    >().toEqualTypeOf<NotificationContentDTO>();
    expectTypeOf<
      z.infer<typeof notificationContentPushOnlySchema>
    >().toEqualTypeOf<NotificationContentPushOnlyDTO>();
    expectTypeOf<
      z.infer<typeof notificationContentPatchSchema>
    >().toEqualTypeOf<NotificationContentPatchDTO>();
    expectTypeOf<
      z.infer<typeof notificationUserReferenceSchema>
    >().toEqualTypeOf<NotificationUserReferenceDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceInputItemSchema>
    >().toEqualTypeOf<NotificationAudienceInputItemDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceInputSchema>
    >().toEqualTypeOf<NotificationAudienceInputDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceItemSchema>
    >().toEqualTypeOf<NotificationAudienceItemDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceSchema>
    >().toEqualTypeOf<NotificationAudienceDTO>();
    expectTypeOf<
      z.infer<typeof notificationDeliveryInputSchema>
    >().toEqualTypeOf<NotificationDeliveryInputDTO>();
    expectTypeOf<
      z.infer<typeof notificationCreationSchema>
    >().toEqualTypeOf<NotificationCreationDTO>();
  });

  it('scheduleのsummary・一覧・詳細shapeが一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationStopSchema>
    >().toEqualTypeOf<NotificationScheduleStopDTO>();
    expectTypeOf<
      z.infer<typeof notificationRecipientResolutionSchema>
    >().toEqualTypeOf<NotificationRecipientResolutionDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleAudienceSchema>
    >().toEqualTypeOf<NotificationScheduleAudienceDTO>();
    expectTypeOf<
      z.infer<typeof notificationRecipientPushSummarySchema>
    >().toEqualTypeOf<NotificationRecipientPushSummaryDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleSummarySchema>
    >().toEqualTypeOf<NotificationScheduleSummaryDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationScheduleListItemSchema>
    >().toEqualTypeOf<AdminNotificationScheduleListItemDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleListItemSchema>
    >().toEqualTypeOf<NotificationScheduleListItemDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceProgressSchema>
    >().toEqualTypeOf<NotificationAudienceProgressDTO>();
    expectTypeOf<
      z.infer<typeof notificationRecipientProgressSchema>
    >().toEqualTypeOf<NotificationRecipientProgressDTO>();
    expectTypeOf<
      z.infer<typeof notificationDeliveryProgressSchema>
    >().toEqualTypeOf<NotificationDeliveryProgressDTO>();
  });

  it('配信結果・再送・管理一覧のshapeが一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationRecipientResultDeliverySchema>
    >().toEqualTypeOf<NotificationRecipientResultDeliveryDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleResultsPaginationSchema>
    >().toEqualTypeOf<NotificationScheduleResultsPaginationDTO>();
    expectTypeOf<
      z.infer<typeof notificationCreateResponseSchema>
    >().toEqualTypeOf<NotificationResendResponseDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationListItemSchema>
    >().toEqualTypeOf<AdminNotificationListItemDTO>();
  });
});
