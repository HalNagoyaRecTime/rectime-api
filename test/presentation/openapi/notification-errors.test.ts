import { describe, expect, it } from 'vitest';
import {
  notificationErrorCodeSchema,
  notificationForbiddenErrorResponseSchema,
  notificationScheduleNotFoundErrorResponseSchema,
} from '../../../src/presentation/openapi/notification';

describe('通知error responseの契約', () => {
  it('Endpointで利用するcodeだけを許可する', () => {
    const forbidden = {
      error: {
        code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN',
        message: '指定された通知重要度は利用できません',
      },
    };
    const scheduleNotFound = {
      error: {
        code: 'NOTIFICATION_SCHEDULE_NOT_FOUND',
        message: '見つかりません',
      },
    };
    const conflict = {
      error: {
        code: 'NOTIFICATION_EDIT_NOT_ALLOWED',
        message: 'この通知は編集できません',
      },
    };

    expect(
      notificationForbiddenErrorResponseSchema.safeParse(forbidden).success
    ).toBe(true);
    expect(
      notificationScheduleNotFoundErrorResponseSchema.safeParse(
        scheduleNotFound
      ).success
    ).toBe(true);
    expect(
      notificationErrorCodeSchema.parse('ADMIN_NOTIFICATION_NOT_FOUND')
    ).toBe('ADMIN_NOTIFICATION_NOT_FOUND');
    expect(
      notificationErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_NOT_FOUND')
    ).toBe('NOTIFICATION_AUDIENCE_NOT_FOUND');
    expect(() =>
      notificationErrorCodeSchema.parse('FIREBASE_TOKEN_FORBIDDEN')
    ).toThrow();
    expect(() =>
      notificationErrorCodeSchema.parse('FIREBASE_TOKEN_NOT_FOUND')
    ).toThrow();
    expect(() =>
      notificationErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_HAS_NO_TOKENS')
    ).toThrow();
    expect(() =>
      notificationErrorCodeSchema.parse('ADMIN_NOTIFICATION_NOT_DRAFT')
    ).toThrow();
    expect(() =>
      notificationErrorCodeSchema.parse('INVALID_NOTIFICATION_DATE')
    ).toThrow();
    expect(
      notificationForbiddenErrorResponseSchema.safeParse(conflict).success
    ).toBe(false);
  });
});
