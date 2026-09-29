import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AdminNotificationDetailDTO,
  AdminNotificationListResponseDTO,
  NotificationAudienceCountRequestDTO,
  NotificationAudienceCountResponseDTO,
  NotificationConfigDTO,
  NotificationCreateRequestDTO,
  NotificationCreateResponseDTO,
  NotificationPatchRequestDTO,
} from '../../../src/application/dto/AdminNotificationDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  adminNotificationDetailSchema,
  adminNotificationListResponseSchema,
  notificationAudienceCountRequestSchema,
  notificationAudienceCountResponseSchema,
  notificationConfigResponseSchema,
  notificationCreateRequestSchema,
  notificationCreateResponseSchema,
  notificationPatchRequestSchema,
  notificationScheduleSummarySchema,
} from '../../../src/presentation/openapi/notification';
import {
  adminDetailSchedule,
  adminListSchedule,
  content,
  creation,
  date,
  stop,
} from './notification.fixtures';

describe('管理通知のResponse schema', () => {
  it('管理通知一覧はitemsと軽量contentだけを返す', () => {
    expect(
      adminNotificationListResponseSchema.safeParse({
        items: [
          {
            notificationId: 108,
            content: { push: content.push },
            importance: 'normal',
            creation,
            createdAt: date,
            schedules: [adminListSchedule],
          },
        ],
      }).success
    ).toBe(true);
    expect(
      adminNotificationListResponseSchema.safeParse({
        notifications: [],
        total: 0,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(false);
    expect(
      adminNotificationListResponseSchema.safeParse({
        items: [
          {
            notificationId: 108,
            content,
            importance: 'normal',
            creation,
            createdAt: date,
            schedules: [],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('管理通知詳細だけがdetail・updatedAt・停止情報を持つ', () => {
    expect(
      adminNotificationDetailSchema.safeParse({
        notificationId: 108,
        content,
        importance: 'normal',
        creation,
        createdAt: date,
        updatedAt: date,
        schedules: [adminDetailSchedule],
      }).success
    ).toBe(true);
    expect(
      notificationScheduleSummarySchema.safeParse({
        ...adminDetailSchedule,
        stop,
      }).success
    ).toBe(true);
  });
});

describe('管理通知のApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('主要なrequest/response DTOと一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationCreateRequestSchema>
    >().toEqualTypeOf<NotificationCreateRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationCreateResponseSchema>
    >().toEqualTypeOf<NotificationCreateResponseDTO>();
    expectTypeOf<
      z.infer<typeof notificationPatchRequestSchema>
    >().toEqualTypeOf<NotificationPatchRequestDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationListResponseSchema>
    >().toEqualTypeOf<AdminNotificationListResponseDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationDetailSchema>
    >().toEqualTypeOf<AdminNotificationDetailDTO>();
    expectTypeOf<
      z.infer<typeof notificationConfigResponseSchema>
    >().toEqualTypeOf<NotificationConfigDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceCountRequestSchema>
    >().toEqualTypeOf<NotificationAudienceCountRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceCountResponseSchema>
    >().toEqualTypeOf<NotificationAudienceCountResponseDTO>();
  });
});
