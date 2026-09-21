import { describe, expect, it } from 'vitest';
import {
  firebaseTokenForbiddenErrorResponseSchema,
  firebaseTokenNotFoundErrorResponseSchema,
  notificationErrorCodeSchema,
  notificationForbiddenErrorResponseSchema,
  notificationScheduleNotFoundErrorResponseSchema,
} from '../../../src/presentation/openapi/notification';

describe('通知error responseの契約', () => {
  it('HTTP endpointごとのcodeだけを許可する', () => {
    const forbidden = {
      error: {
        code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN',
        message: '指定された通知重要度は利用できません',
      },
    };
    const firebaseForbidden = {
      error: {
        code: 'FIREBASE_TOKEN_FORBIDDEN',
        message: '権限がありません',
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
      notificationForbiddenErrorResponseSchema.safeParse(firebaseForbidden)
        .success
    ).toBe(false);
    expect(
      firebaseTokenForbiddenErrorResponseSchema.safeParse(firebaseForbidden)
        .success
    ).toBe(true);
    expect(
      firebaseTokenNotFoundErrorResponseSchema.safeParse(scheduleNotFound)
        .success
    ).toBe(false);
    expect(
      notificationScheduleNotFoundErrorResponseSchema.safeParse(
        scheduleNotFound
      ).success
    ).toBe(true);
    expect(notificationErrorCodeSchema.parse('FIREBASE_TOKEN_FORBIDDEN')).toBe(
      'FIREBASE_TOKEN_FORBIDDEN'
    );
    expect(
      notificationErrorCodeSchema.parse('ADMIN_NOTIFICATION_NOT_FOUND')
    ).toBe('ADMIN_NOTIFICATION_NOT_FOUND');
    expect(
      notificationErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_NOT_FOUND')
    ).toBe('NOTIFICATION_AUDIENCE_NOT_FOUND');
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
