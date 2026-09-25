import { describe, expect, expectTypeOf, it } from 'vitest';
import type { NotificationStopResponseDTO } from '../../../src/application/dto/AdminNotificationDTO';
import type {
  NotificationResendRequestDTO,
  NotificationScheduleDetailDTO,
  NotificationScheduleListResponseDTO,
  NotificationScheduleResultsResponseDTO,
} from '../../../src/application/dto/NotificationScheduleDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  notificationResendRequestSchema,
  notificationScheduleDetailSchema,
  notificationScheduleListResponseSchema,
  notificationScheduleResultsResponseSchema,
  notificationStopResponseSchema,
} from '../../../src/presentation/openapi/notification';
import {
  audience,
  recipientResult,
  scheduleDetail,
  scheduleListItem,
} from './notification.fixtures';

describe('通知スケジュールのResponse schema', () => {
  it('スケジュール一覧は軽量なitemsを返す', () => {
    expect(
      notificationScheduleListResponseSchema.safeParse({
        items: [scheduleListItem],
      }).success
    ).toBe(true);
    expect(
      notificationScheduleListResponseSchema.safeParse({
        items: [{ ...scheduleListItem, audience }],
      }).success
    ).toBe(false);
    expect(
      notificationScheduleListResponseSchema.safeParse({
        schedules: [scheduleListItem],
        total: 1,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(false);
  });

  it('スケジュール詳細はprogressをトップレベルに置く', () => {
    expect(
      notificationScheduleDetailSchema.safeParse(scheduleDetail).success
    ).toBe(true);
    expect(
      notificationScheduleDetailSchema.safeParse({
        ...scheduleDetail,
        progress: {
          audienceProgress: scheduleDetail.audienceProgress,
          recipientProgress: scheduleDetail.recipientProgress,
          deliveryProgress: scheduleDetail.deliveryProgress,
        },
      }).success
    ).toBe(false);
    expect(
      notificationScheduleDetailSchema.safeParse({
        ...scheduleDetail,
        scheduledBy: null,
        createdAt: '2026-11-07T15:35:00+09:00',
      }).success
    ).toBe(false);
  });

  it('結果はrecipient単位のdeliveriesとpage paginationを返す', () => {
    expect(
      notificationScheduleResultsResponseSchema.safeParse({
        notificationScheduleId: 501,
        recipients: {
          items: [recipientResult],
          pagination: { page: 1, limit: 50, totalCount: 1, totalPages: 1 },
        },
      }).success
    ).toBe(true);
    expect(
      notificationScheduleResultsResponseSchema.safeParse({
        results: [recipientResult],
        total: 1,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(false);
  });
});

describe('通知スケジュールのApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('主要なrequest/response DTOと一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationScheduleListResponseSchema>
    >().toEqualTypeOf<NotificationScheduleListResponseDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleDetailSchema>
    >().toEqualTypeOf<NotificationScheduleDetailDTO>();
    expectTypeOf<
      z.infer<typeof notificationScheduleResultsResponseSchema>
    >().toEqualTypeOf<NotificationScheduleResultsResponseDTO>();
    expectTypeOf<
      z.infer<typeof notificationResendRequestSchema>
    >().toEqualTypeOf<NotificationResendRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationStopResponseSchema>
    >().toEqualTypeOf<NotificationStopResponseDTO>();
  });
});
