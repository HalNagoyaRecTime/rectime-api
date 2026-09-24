import { describe, expect, it } from 'vitest';
import {
  legacyAdminNotificationCreateRoute,
  legacyAdminNotificationDeleteRoute,
  legacyAdminNotificationDetailRoute,
  legacyAdminNotificationListRoute,
  legacyAdminNotificationUpdateRoute,
} from '../../../src/presentation/openapi/notification/legacy/admin';
import {
  adminNotificationCreateRoute,
  adminNotificationDetailRoute,
  adminNotificationListRoute,
  adminNotificationPatchRoute,
  firebaseTokenDeleteRoute,
  firebaseTokenRegistrationRoute,
  notificationAudienceCountRoute,
  notificationAudienceNotFoundErrorResponseSchema,
  notificationPushDeliveryDetailRoute,
  notificationScheduleDeleteRoute,
  notificationScheduleListRoute,
  notificationScheduleResendRoute,
  notificationScheduleResultsRoute,
  notificationScheduleStopRoute,
} from '../../../src/presentation/openapi/notification';

describe('通知endpointの契約', () => {
  it('legacy管理通知ルートを明示名で分離する', () => {
    expect(legacyAdminNotificationCreateRoute.method).toBe('post');
    expect(legacyAdminNotificationListRoute.method).toBe('get');
    expect(legacyAdminNotificationDetailRoute.method).toBe('get');
    expect(legacyAdminNotificationUpdateRoute.method).toBe('put');
    expect(legacyAdminNotificationDeleteRoute.method).toBe('delete');
  });

  it('新契約のmethod/pathとqueryを定義する', () => {
    expect(adminNotificationCreateRoute.method).toBe('post');
    expect(adminNotificationPatchRoute.method).toBe('patch');
    expect(adminNotificationListRoute.path).toBe('/admin/notifications');
    expect(adminNotificationDetailRoute.path).toContain('{notificationId}');
    expect(notificationScheduleListRoute.path).toBe(
      '/admin/notifications/schedules'
    );
    expect(notificationScheduleResendRoute.path).toContain('/resend');
    expect(notificationScheduleDeleteRoute.path).toContain('/schedules/');
    expect(notificationScheduleStopRoute.path).toContain('/stop');
    expect(notificationScheduleResultsRoute.path).toContain('/results');
    expect(notificationPushDeliveryDetailRoute.path).toContain(
      'push-deliveries'
    );
    expect(firebaseTokenRegistrationRoute.method).toBe('post');
    expect(firebaseTokenDeleteRoute.method).toBe('delete');
  });

  it('Audience Countは対象不存在の404と固有Error schemaを定義する', () => {
    const response = notificationAudienceCountRoute.responses[404];
    const schema = response?.content?.['application/json']?.schema;

    expect(response).toBeDefined();
    expect(schema).toBe(notificationAudienceNotFoundErrorResponseSchema);
    expect(
      schema?.safeParse({
        error: {
          code: 'NOTIFICATION_AUDIENCE_NOT_FOUND',
          message: '通知対象が存在しません',
        },
      }).success
    ).toBe(true);
    expect(
      schema?.safeParse({
        error: {
          code: 'ADMIN_NOTIFICATION_NOT_FOUND',
          message: '通知が存在しません',
        },
      }).success
    ).toBe(false);
  });
});
