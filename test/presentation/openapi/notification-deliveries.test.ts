import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  NotificationPushDeliveryDetailDTO,
  NotificationRecipientResultDTO,
} from '../../../src/application/dto/NotificationScheduleDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  notificationPushDeliveryDetailSchema,
  notificationRecipientResultSchema,
} from '../../../src/presentation/openapi/notification';
import { pushDetail, recipientResult } from './notification.fixtures';

describe('通知Push配信のResponse schema', () => {
  it('Push詳細は既存の詳細shapeを維持する', () => {
    expect(
      notificationPushDeliveryDetailSchema.safeParse(pushDetail).success
    ).toBe(true);
  });

  it('結果のrecipient itemはdeliveriesを持つ', () => {
    expect(
      notificationRecipientResultSchema.safeParse(recipientResult).success
    ).toBe(true);
  });
});

describe('通知Push配信のApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('recipient resultとPush詳細が一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationRecipientResultSchema>
    >().toEqualTypeOf<NotificationRecipientResultDTO>();
    expectTypeOf<
      z.infer<typeof notificationPushDeliveryDetailSchema>
    >().toEqualTypeOf<NotificationPushDeliveryDetailDTO>();
  });
});
