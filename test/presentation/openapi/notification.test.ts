import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_DELIVERY_TYPES,
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_TYPES,
} from '../../../src/domain/entities/Notification';
import {
  adminNotificationCreateRoute,
  adminNotificationDetailRoute,
  adminNotificationPatchRoute,
  firebaseTokenRegistrationRequestSchema,
  firebaseTokenSchema,
  notificationAudienceCountRequestSchema,
  notificationAudienceInputItemSchema,
  notificationAudienceItemSchema,
  notificationAudienceSchema,
  notificationConfigResponseSchema,
  notificationContentPatchSchema,
  notificationCreationSchema,
  notificationCreateRequestSchema,
  notificationCreateResponseSchema,
  notificationDeliveryInputSchema,
  notificationPatchRequestSchema,
  notificationPushDeliveryDetailSchema,
  notificationRecipientResultSchema,
  notificationResendRequestSchema,
  notificationScheduleDetailSchema,
  notificationScheduleListResponseSchema,
  notificationScheduleResultsResponseSchema,
  notificationScheduleSummarySchema,
  notificationScheduleResendRoute,
  notificationConflictErrorResponseSchema,
  notificationErrorCodeSchema,
  notificationForbiddenErrorResponseSchema,
  notificationTypeSchema,
} from '../../../src/presentation/openapi/notification';

const date = '2026-11-07T15:35:00+09:00';
const content = {
  push: { title: '集合時間変更', body: '集合時間が変更されました。' },
  detail: { title: '集合時間変更のお知らせ', body: '詳細をご確認ください。' },
};
const progress = {
  audienceProgress: { totalCount: 4, resolvedCount: 4 },
  recipientProgress: { count: 1204, status: 'resolved' as const },
  deliveryProgress: {
    totalCount: 1229,
    pendingCount: 0,
    sendingCount: 12,
    retryWaitCount: 151,
    sentCount: 1058,
    failedCount: 8,
    stoppedCount: 0,
  },
};

const monitorItem = {
  notificationScheduleId: 501,
  notificationId: 108,
  content,
  creation: {
    method: 'automatic' as const,
    user: null,
    source: { type: 'gathering' as const, id: 51, label: null },
  },
  sendAt: date,
  status: 'sending' as const,
  stop: null,
  scheduledBy: null,
  createdAt: date,
  startedAt: date,
  completedAt: null,
  audience: {
    items: [{ type: 'gathering' as const, targetId: 51, label: null }],
    recipientResolution: { status: 'resolved' as const, resolvedCount: 4 },
  },
  recipientPushSummary: {
    totalCount: 1204,
    successCount: 1058,
    failedCount: 8,
    noPushTargetCount: 138,
  },
  progress,
};

describe('通知基盤のDomain literal', () => {
  it('Schedule statusは6種類だけを正本として持つ', () => {
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

  it('Push Delivery status、Audience type、Importanceを正本から公開する', () => {
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
    expect(NOTIFICATION_IMPORTANCE_LEVELS).toEqual(['low', 'normal', 'high']);
    expect(NOTIFICATION_DELIVERY_TYPES).toEqual(['immediate', 'scheduled']);
    expect(NOTIFICATION_TYPES).toEqual(['notification_general']);
    expect(NOTIFICATION_SOURCE_TYPES).toEqual(['gathering']);
    expect(notificationTypeSchema.parse('notification_general')).toBe(
      'notification_general'
    );
  });
});

describe('通知基盤のRequest / Response schema', () => {
  it('AudienceのRequestとResponseを分離し、Requestではlabelを受け付けない', () => {
    for (const item of [
      { type: 'all' },
      { type: 'class_room', targetId: 3 },
      { type: 'gathering', targetId: 51 },
      { type: 'event', targetId: 81 },
      { type: 'user', targetId: 123 },
    ]) {
      expect(notificationAudienceInputItemSchema.safeParse(item).success).toBe(
        true
      );
    }

    expect(
      notificationAudienceInputItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
        label: 'Frontend label',
      }).success
    ).toBe(false);
    expect(
      notificationAudienceInputItemSchema.safeParse({
        type: 'event_participants',
        targetId: 81,
      }).success
    ).toBe(false);
    expect(
      notificationAudienceInputItemSchema.safeParse({ type: 'gathering' })
        .success
    ).toBe(false);

    expect(
      notificationAudienceItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
        label: null,
      }).success
    ).toBe(true);
    expect(
      notificationAudienceItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
      }).success
    ).toBe(false);
    expect(
      notificationAudienceSchema.safeParse({ items: [{ type: 'all' }] }).success
    ).toBe(true);
  });

  it('Create Requestは完全なContentとInput Audienceを受け付ける', () => {
    expect(
      notificationCreateRequestSchema.safeParse({
        content,
        audience: {
          items: [
            { type: 'class_room', targetId: 3 },
            { type: 'gathering', targetId: 51 },
          ],
        },
        delivery: { type: 'scheduled', sendAt: date },
        importance: 'normal',
      }).success
    ).toBe(true);
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

  it('manual creationは作成User削除後のnullを表現できる', () => {
    expect(
      notificationCreationSchema.safeParse({
        method: 'manual',
        user: null,
        source: null,
      }).success
    ).toBe(true);
    expect(
      notificationCreationSchema.safeParse({
        method: 'automatic',
        user: null,
        source: { type: 'gathering', id: 51, label: null },
      }).success
    ).toBe(true);
  });

  it('Create responseを最小shapeで固定する', () => {
    expect(
      notificationCreateResponseSchema.parse({
        notificationId: 108,
        notificationScheduleId: 501,
      })
    ).toEqual({ notificationId: 108, notificationScheduleId: 501 });
  });

  it('nested partial PATCHは変更対象だけを受け付け、空objectを拒否する', () => {
    expect(
      notificationPatchRequestSchema.safeParse({
        content: { detail: { body: '集合場所が変更になりました。' } },
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({
        content: { push: { title: '集合時間変更' } },
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({ content: {} }).success
    ).toBe(false);
    expect(
      notificationPatchRequestSchema.safeParse({ content: { push: {} } })
        .success
    ).toBe(false);
    expect(notificationPatchRequestSchema.safeParse({}).success).toBe(false);
    expect(
      notificationPatchRequestSchema.safeParse({
        schedule: { notificationScheduleId: 501 },
      }).success
    ).toBe(false);
    expect(
      notificationPatchRequestSchema.safeParse({
        schedule: {
          notificationScheduleId: 501,
          delivery: { type: 'scheduled', sendAt: date },
        },
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({
        schedule: {
          notificationScheduleId: 501,
          audience: { items: [{ type: 'gathering', targetId: 51 }] },
        },
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({
        audience: { items: [{ type: 'gathering', targetId: 51 }] },
      }).success
    ).toBe(false);
    expect(
      notificationContentPatchSchema.safeParse({ detail: {} }).success
    ).toBe(false);
  });

  it('ConfigはDomain上のhighを表現し、通常Userのoptionsも受け付ける', () => {
    expect(
      notificationConfigResponseSchema.parse({
        importance: { default: 'normal', options: ['low', 'normal'] },
      })
    ).toEqual({
      importance: { default: 'normal', options: ['low', 'normal'] },
    });
    expect(
      notificationConfigResponseSchema.safeParse({
        importance: { default: 'normal', options: ['low', 'normal', 'high'] },
      }).success
    ).toBe(true);
  });
});

describe('通知基盤の結果・Token・Monitor schema', () => {
  it('Schedule summaryはRecipient集計とDelivery件数を分離する', () => {
    expect(
      notificationScheduleSummarySchema.safeParse({
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
      }).success
    ).toBe(true);
  });

  it('Monitor list/detailはSchedule中心の専用shapeを持つ', () => {
    expect(
      notificationScheduleListResponseSchema.safeParse({
        schedules: [monitorItem],
        total: 1,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(true);
    expect(
      notificationScheduleDetailSchema.safeParse({
        ...monitorItem,
        updatedAt: date,
      }).success
    ).toBe(true);
  });

  it('ResultsはRecipient単位で、PushDeliveryDetailをそのまま返さない', () => {
    const recipientResult = {
      notificationRecipientId: 1201,
      user: { userId: 123, userName: 'HAL 太郎' },
      push: { status: 'success' as const, successCount: 1, failedCount: 1 },
    };
    expect(
      notificationRecipientResultSchema.safeParse(recipientResult).success
    ).toBe(true);
    expect(
      notificationScheduleResultsResponseSchema.safeParse({
        results: [recipientResult],
        total: 1,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(true);
    expect(
      notificationScheduleResultsResponseSchema.safeParse({
        results: [
          {
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
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(false);
  });

  it('Push Delivery detailはToken単位でfirebaseTokenId nullを許容する', () => {
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

  it('Firebase TokenはisActiveを持たず、Registration requestを分離する', () => {
    expect(
      firebaseTokenRegistrationRequestSchema.safeParse({
        fcmToken: 'token',
        platform: 'ios',
      }).success
    ).toBe(true);
    expect(
      firebaseTokenSchema.safeParse({
        firebaseTokenId: 10,
        userId: 123,
        platform: 'ios',
        lastSeenAt: date,
      }).success
    ).toBe(true);
    expect(
      firebaseTokenSchema.safeParse({
        firebaseTokenId: 10,
        userId: 123,
        platform: 'ios',
        lastSeenAt: date,
        isActive: true,
      }).success
    ).toBe(false);
  });
});

describe('通知基盤のEndpoint契約', () => {
  it('PATCHを使用し、PUTを定義しない', () => {
    expect(adminNotificationPatchRoute.method).toBe('patch');
    expect(adminNotificationPatchRoute.path).toBe(
      '/admin/notifications/{notificationId}'
    );
  });

  it('管理通知のmutationとmonitor endpointを定義する', () => {
    expect(adminNotificationCreateRoute.method).toBe('post');
    expect(adminNotificationDetailRoute.method).toBe('get');
    expect(notificationScheduleResendRoute.method).toBe('post');
    expect(notificationScheduleResendRoute.path).toContain('/resend');
  });

  it('resend Requestはbody必須で即時・日時指定を受け付ける', () => {
    expect(
      notificationResendRequestSchema.safeParse({
        delivery: { type: 'immediate', sendAt: null },
      }).success
    ).toBe(true);
    expect(
      notificationResendRequestSchema.safeParse({
        delivery: { type: 'scheduled', sendAt: date },
      }).success
    ).toBe(true);
    expect(notificationResendRequestSchema.safeParse({}).success).toBe(false);
  });

  it('Error codeは通知契約で定義したcodeだけを受け付ける', () => {
    expect(notificationErrorCodeSchema.parse('VALIDATION_ERROR')).toBe(
      'VALIDATION_ERROR'
    );
    expect(() =>
      notificationErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_HAS_NO_TOKENS')
    ).toThrow();
  });

  it('Error ResponseはHTTP statusごとに許可codeを絞る', () => {
    const forbidden = {
      error: {
        code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN',
        message: '指定された通知重要度は利用できません',
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
      notificationForbiddenErrorResponseSchema.safeParse(conflict).success
    ).toBe(false);
    expect(
      notificationConflictErrorResponseSchema.safeParse(conflict).success
    ).toBe(true);
  });

  it('Audience CountはToken必須ではないInput Audienceを受け付ける', () => {
    expect(
      notificationAudienceCountRequestSchema.safeParse({
        audience: { items: [{ type: 'all' }] },
      }).success
    ).toBe(true);
  });
});
