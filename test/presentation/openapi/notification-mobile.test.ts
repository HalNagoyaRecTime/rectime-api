import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  MobileNotificationDTO,
  MobileNotificationListResponseDTO,
} from '../../../src/application/dto/MobileNotificationDTO';
import { NOTIFICATION_TYPES } from '../../../src/domain/entities/Notification';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  mobileNotificationListResponseSchema,
  mobileNotificationListQuery,
  mobileNotificationResponseSchema,
} from '../../../src/presentation/openapi/notification/mobileNotifications';

describe('Mobile通知のApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('Application DTOとOpenAPI response型が相互代入可能', () => {
    type SchemaDTO = z.infer<typeof mobileNotificationResponseSchema>;
    type SchemaListDTO = z.infer<typeof mobileNotificationListResponseSchema>;

    expectTypeOf<MobileNotificationDTO>().toEqualTypeOf<SchemaDTO>();
    expectTypeOf<SchemaDTO>().toEqualTypeOf<MobileNotificationDTO>();
    expectTypeOf<MobileNotificationListResponseDTO>().toEqualTypeOf<SchemaListDTO>();
    expectTypeOf<SchemaListDTO>().toEqualTypeOf<MobileNotificationListResponseDTO>();
    expectTypeOf<MobileNotificationDTO['notification_type']>().toEqualTypeOf<
      (typeof NOTIFICATION_TYPES)[number]
    >();
  });

  it('notification_generalを正本とし、related_eventをResponseに含めない', () => {
    expect(mobileNotificationResponseSchema.shape).not.toHaveProperty(
      'related_event'
    );
    expect(
      mobileNotificationResponseSchema.safeParse({
        notification_id: 108,
        notification_type: 'notification_general',
        title: '集合時間変更',
        body: '集合時間が変更になりました。',
        scheduled_at: '2026-11-07T15:35:00+09:00',
      }).success
    ).toBe(true);
    expect(
      mobileNotificationResponseSchema.safeParse({
        notification_id: 108,
        notification_type: 'manual',
        title: '集合時間変更',
        body: '集合時間が変更になりました。',
        scheduled_at: '2026-11-07T15:35:00+09:00',
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

  it('空queryでdefaultを適用し、safe integer外のoffsetを拒否する', () => {
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
    expect(
      mobileNotificationListQuery.safeParse({
        offset: String(Number.MAX_SAFE_INTEGER + 1),
      }).success
    ).toBe(false);
  });
});
