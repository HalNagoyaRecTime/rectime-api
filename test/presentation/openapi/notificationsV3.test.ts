import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  NOTIFICATION_SCHEDULE_STATUSES,
} from '../../../src/domain/entities/NotificationV3';
import {
  adminNotificationV3CreateRoute,
  adminNotificationV3PatchRoute,
  adminNotificationV3DetailRoute,
  notificationAudienceCountRoute,
  notificationAudienceCountRequestSchema,
  notificationAudienceItemSchema,
  notificationCreateResponseSchema,
  notificationDeliveryInputSchema,
  notificationPushDeliveryDetailSchema,
  notificationScheduleDetailSchema,
  notificationScheduleListRoute,
  notificationScheduleResultsRoute,
  notificationScheduleStopRoute,
  notificationScheduleSummarySchema,
  notificationV3ErrorCodeSchema,
} from '../../../src/presentation/openapi/notificationsV3';

const date = '2026-11-07T15:35:00+09:00';

describe('通知基盤v3のDomain literal', () => {
  it('Schedule statusはv3の6種類だけを正本として持つ', () => {
    expect(NOTIFICATION_SCHEDULE_STATUSES).toEqual([
      'scheduled',
      'resolving',
      'sending',
      'completed',
      'failed',
      'stopped',
    ]);
    expect(NOTIFICATION_SCHEDULE_STATUSES).not.toContain('draft');
    expect(NOTIFICATION_SCHEDULE_STATUSES).not.toContain('sent');
  });

  it('Push Delivery statusとAudience typeを正本から公開する', () => {
    expect(NOTIFICATION_PUSH_DELIVERY_STATUSES).toEqual([
      'pending',
      'sending',
      'retry_wait',
      'sent',
      'failed',
      'stopped',
    ]);
    expect(NOTIFICATION_AUDIENCE_TYPES).toEqual([
      'all',
      'class_room',
      'gathering',
      'event',
      'user',
    ]);
  });
});

describe('通知基盤v3のRequest / Response schema', () => {
  it('Audienceは5種類を受け付け、旧typeとtarget欠落を拒否する', () => {
    for (const item of [
      { type: 'all' },
      { type: 'class_room', targetId: 3 },
      { type: 'gathering', targetId: 51 },
      { type: 'event', targetId: 81 },
      { type: 'user', targetId: 123 },
    ]) {
      expect(notificationAudienceItemSchema.safeParse(item).success).toBe(true);
    }

    expect(
      notificationAudienceItemSchema.safeParse({
        type: 'event_participants',
        targetId: 81,
      }).success
    ).toBe(false);
    expect(
      notificationAudienceItemSchema.safeParse({ type: 'gathering' }).success
    ).toBe(false);
  });

  it('DeliveryはimmediateとscheduledでsendAtのnullabilityを固定する', () => {
    expect(
      notificationDeliveryInputSchema.safeParse({
        type: 'immediate',
        sendAt: null,
      }).success
    ).toBe(true);
    expect(
      notificationDeliveryInputSchema.safeParse({
        type: 'scheduled',
        sendAt: date,
      }).success
    ).toBe(true);
    expect(
      notificationDeliveryInputSchema.safeParse({
        type: 'immediate',
        sendAt: date,
      }).success
    ).toBe(false);
  });

  it('Create responseを最小shapeで固定する', () => {
    expect(
      notificationCreateResponseSchema.parse({
        notificationId: 108,
        notificationScheduleId: 501,
      })
    ).toEqual({ notificationId: 108, notificationScheduleId: 501 });
  });

  it('source label null、Recipient人数とDelivery件数の分離を表現できる', () => {
    const summary = notificationScheduleSummarySchema.safeParse({
      notificationScheduleId: 501,
      sendAt: date,
      status: 'resolving',
      stop: null,
      scheduledBy: null,
      createdAt: date,
      audience: {
        items: [{ type: 'gathering', targetId: 51, label: null }],
        recipientResolution: { status: 'resolved', resolvedCount: 4 },
      },
      recipientPushSummary: {
        totalCount: 1204,
        successCount: 1058,
        failedCount: 8,
        noPushTargetCount: 138,
      },
    });
    expect(summary.success).toBe(true);

    expect(
      notificationScheduleDetailSchema.safeParse({
        notificationScheduleId: 501,
        sendAt: date,
        status: 'sending',
        stop: null,
        scheduledBy: null,
        createdAt: date,
        updatedAt: date,
        audience: {
          items: [{ type: 'all' }],
          recipientResolution: { status: 'resolved', resolvedCount: 4 },
        },
        recipientPushSummary: {
          totalCount: 1204,
          successCount: 1058,
          failedCount: 8,
          noPushTargetCount: 138,
        },
        progress: {
          audienceProgress: { totalCount: 4, resolvedCount: 4 },
          recipientProgress: { count: 1204, status: 'resolved' },
          deliveryProgress: {
            totalCount: 1229,
            pendingCount: 0,
            sendingCount: 12,
            retryWaitCount: 151,
            sentCount: 1058,
            failedCount: 8,
            stoppedCount: 0,
          },
        },
      }).success
    ).toBe(true);
  });

  it('Push Delivery detailはToken削除後のnullを許容する', () => {
    expect(
      notificationPushDeliveryDetailSchema.safeParse({
        notificationPushDeliveryId: 9012,
        notificationRecipientId: 1201,
        firebaseTokenId: null,
        platform: 'ios',
        status: 'failed',
        attemptCount: 2,
        firstAttemptAt: date,
        lastAttemptAt: date,
        nextRetryAt: null,
        sentAt: null,
        failedReason: 'UNREGISTERED',
        fcmMessageId: null,
      }).success
    ).toBe(true);
  });

  it('Error codeは共通契約とv3専用契約だけを受け付ける', () => {
    expect(notificationV3ErrorCodeSchema.parse('VALIDATION_ERROR')).toBe(
      'VALIDATION_ERROR'
    );
    expect(
      notificationV3ErrorCodeSchema.parse(
        'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'
      )
    ).toBe('NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED');
    expect(() =>
      notificationV3ErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_HAS_NO_TOKENS')
    ).toThrow();
  });
});

describe('通知基盤v3のEndpoint契約', () => {
  it('PATCHを使用し、PUTを定義しない', () => {
    expect(adminNotificationV3PatchRoute.method).toBe('patch');
    expect(adminNotificationV3PatchRoute.path).toBe(
      '/admin/notifications/{notificationId}'
    );
  });

  it('管理通知のmutationとmonitor endpointを定義する', () => {
    expect(adminNotificationV3CreateRoute.method).toBe('post');
    expect(adminNotificationV3DetailRoute.method).toBe('get');
    expect(notificationAudienceCountRoute.path).toBe(
      '/admin/notifications/audience-count'
    );
    expect(notificationScheduleListRoute.path).toBe(
      '/admin/notifications/schedules'
    );
    expect(notificationScheduleResultsRoute.path).toContain('/results');
    expect(notificationScheduleStopRoute.path).toContain('/stop');
  });

  it('Audience Count requestを共通Audience shapeで受け付ける', () => {
    expect(
      notificationAudienceCountRequestSchema.safeParse({
        audience: {
          items: [{ type: 'user', targetId: 123 }],
        },
      }).success
    ).toBe(true);
  });
});
