import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  MobileNotificationType,
  MobileNotificationDTO,
  MobileNotificationListResponseDTO,
} from '../../../src/application/dto/MobileNotificationDTO';
import { MOBILE_NOTIFICATION_TYPES } from '../../../src/application/dto/MobileNotificationDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  mobileNotificationListResponseSchema,
  mobileNotificationListQuery,
  mobileNotificationResponseSchema,
} from '../../../src/presentation/openapi/notification/mobileNotifications';

describe('Mobile通知のApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('Response DTOをPresentation側で再定義せず一致させる', () => {
    expectTypeOf<
      z.infer<typeof mobileNotificationResponseSchema>
    >().toEqualTypeOf<MobileNotificationDTO>();
    expectTypeOf<
      z.infer<typeof mobileNotificationListResponseSchema>
    >().toEqualTypeOf<MobileNotificationListResponseDTO>();
    expectTypeOf<
      MobileNotificationDTO['notification_type']
    >().toEqualTypeOf<MobileNotificationType>();
    expectTypeOf<
      z.infer<typeof mobileNotificationResponseSchema>['notification_type']
    >().toEqualTypeOf<MobileNotificationType>();
    expectTypeOf<MobileNotificationType>().toEqualTypeOf<
      'manual' | 'event_reminder' | 'schedule_reminder' | 'schedule_update'
    >();
  });

  it('既存Mobile契約のsnake_caseとpaginationを維持する', () => {
    expect(
      mobileNotificationResponseSchema.safeParse({
        notification_id: 108,
        notification_type: 'manual',
        title: '集合時間変更',
        body: '集合時間が変更になりました。',
        scheduled_at: '2026-11-07T15:35:00+09:00',
        related_event: null,
      }).success
    ).toBe(true);
    expect(
      mobileNotificationResponseSchema.safeParse({
        notificationId: 108,
        notification_type: 'manual',
        title: '集合時間変更',
        body: '集合時間が変更になりました。',
        scheduled_at: '2026-11-07T15:35:00+09:00',
        related_event: null,
      }).success
    ).toBe(false);
    expect(
      mobileNotificationListResponseSchema.safeParse({
        notifications: [],
        total: 0,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(true);
  });

  it('Mobile互換typeだけをResponseで許可する', () => {
    for (const notificationType of MOBILE_NOTIFICATION_TYPES) {
      expect(
        mobileNotificationResponseSchema.safeParse({
          notification_id: 108,
          notification_type: notificationType,
          title: '集合時間変更',
          body: '集合時間が変更になりました。',
          scheduled_at: '2026-11-07T15:35:00+09:00',
          related_event: null,
        }).success
      ).toBe(true);
    }

    for (const notificationType of ['notification_general', 'unknown_value']) {
      expect(
        mobileNotificationResponseSchema.safeParse({
          notification_id: 108,
          notification_type: notificationType,
          title: '集合時間変更',
          body: '集合時間が変更になりました。',
          scheduled_at: '2026-11-07T15:35:00+09:00',
          related_event: null,
        }).success
      ).toBe(false);
    }
  });

  it('共通pagination schemaをsafeParseするとMobileのdefaultが確定する', () => {
    expect(mobileNotificationListQuery.safeParse({})).toMatchObject({
      success: true,
      data: { limit: 50, offset: 0 },
    });
    expect(
      mobileNotificationListQuery.safeParse({ limit: '1', offset: '0' })
    ).toMatchObject({
      success: true,
      data: { limit: 1, offset: 0 },
    });
  });
});
