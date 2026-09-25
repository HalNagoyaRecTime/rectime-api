import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  MobileNotificationDTO,
  MobileNotificationListResponseDTO,
} from '../../../src/application/dto/MobileNotificationDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  mobileNotificationListResponseSchema,
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
  });

  it('既存Mobile契約のsnake_caseとpaginationを維持する', () => {
    expect(
      mobileNotificationResponseSchema.safeParse({
        notification_id: 108,
        notification_type: 'notification_general',
        title: '集合時間変更',
        body: '集合時間が変更になりました。',
        scheduled_at: '2026-11-07T15:35:00+09:00',
        related_event: null,
      }).success
    ).toBe(true);
    expect(
      mobileNotificationResponseSchema.safeParse({
        notificationId: 108,
        notification_type: 'notification_general',
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
});
