import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AdminNotificationDetailDTO,
  AdminNotificationListResponseDTO,
  NotificationAudienceCountRequestDTO,
  NotificationAudienceCountResponseDTO,
  NotificationConfigDTO,
  NotificationCreateRequestDTO,
  NotificationCreateResponseDTO,
  NotificationPatchRequestDTO,
  NotificationStopResponseDTO,
} from '../../../src/application/dto/AdminNotificationDTO';
import type {
  NotificationPushDeliveryDetailDTO,
  NotificationRecipientResultDTO,
  NotificationScheduleDetailDTO,
  NotificationScheduleListResponseDTO,
  NotificationScheduleResultsResponseDTO,
  NotificationResendRequestDTO,
} from '../../../src/application/dto/NotificationScheduleDTO';
import type {
  FirebaseTokenDTO,
  FirebaseTokenRegistrationRequestDTO,
} from '../../../src/application/dto/FirebaseTokenDTO';
import {
  NOTIFICATION_AUDIENCE_TYPES,
  NOTIFICATION_DELIVERY_TYPES,
  NOTIFICATION_IMPORTANCE_LEVELS,
  NOTIFICATION_PUSH_DELIVERY_STATUSES,
  NOTIFICATION_SCHEDULE_STATUSES,
  NOTIFICATION_SOURCE_TYPES,
  NOTIFICATION_TYPES,
} from '../../../src/domain/entities/Notification';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  adminNotificationCreateRoute,
  adminNotificationDetailRoute,
  adminNotificationListResponseSchema,
  adminNotificationListRoute,
  adminNotificationPatchRoute,
  adminNotificationDetailSchema,
  firebaseTokenRegistrationRequestSchema,
  firebaseTokenRegistrationRoute,
  firebaseTokenSchema,
  firebaseTokenDeleteRoute,
  notificationAudienceCountRequestSchema,
  notificationAudienceCountResponseSchema,
  notificationAudienceInputItemSchema,
  notificationAudienceItemSchema,
  notificationAudienceSchema,
  notificationConfigResponseSchema,
  notificationContentPatchSchema,
  notificationCreateRequestSchema,
  notificationCreateResponseSchema,
  notificationDateRangeQuery,
  notificationDeliveryInputSchema,
  notificationForbiddenErrorResponseSchema,
  notificationPatchRequestSchema,
  notificationPushDeliveryDetailSchema,
  notificationPushDeliveryDetailRoute,
  notificationRecipientResultSchema,
  notificationResendRequestSchema,
  notificationResultsQuery,
  notificationScheduleDetailSchema,
  notificationScheduleListResponseSchema,
  notificationScheduleListRoute,
  notificationScheduleResultsResponseSchema,
  notificationScheduleResultsRoute,
  notificationScheduleSummarySchema,
  notificationScheduleResendRoute,
  notificationScheduleStopRoute,
  notificationScheduleDeleteRoute,
  notificationStopResponseSchema,
  notificationErrorCodeSchema,
  firebaseTokenForbiddenErrorResponseSchema,
  firebaseTokenNotFoundErrorResponseSchema,
  notificationScheduleNotFoundErrorResponseSchema,
} from '../../../src/presentation/openapi/notification';

const date = '2026-11-07T15:35:00+09:00';
const content = {
  push: { title: '集合時間変更', body: '集合時間が変更されました。' },
  detail: { title: '集合時間変更のお知らせ', body: '詳細をご確認ください。' },
};
const creation = {
  method: 'automatic' as const,
  user: null,
  source: { type: 'gathering' as const, id: 51, label: null },
};
const audience = {
  items: [{ type: 'gathering' as const, targetId: 51, label: null }],
  recipientResolution: { status: 'resolved' as const, resolvedCount: 4 },
};
const recipientPushSummary = {
  totalCount: 1204,
  successCount: 1058,
  failedCount: 8,
  noPushTargetCount: 138,
};
const stop = {
  reason: 'manual' as const,
  stoppedAt: date,
  stoppedBy: { userId: 123, userName: 'HAL 太郎' },
};

const adminListSchedule = {
  notificationScheduleId: 501,
  sendAt: date,
  status: 'sending' as const,
  scheduledBy: null,
  createdAt: date,
  audience,
  recipientPushSummary,
};

const adminDetailSchedule = {
  ...adminListSchedule,
  stop: null,
};

const scheduleListItem = {
  notificationId: 108,
  notificationScheduleId: 501,
  content: { push: content.push },
  importance: 'normal' as const,
  sendAt: date,
  status: 'sending' as const,
  stop,
  creation,
};

const scheduleDetail = {
  ...scheduleListItem,
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

const recipientResult = {
  notificationRecipientId: 1201,
  user: { userId: 123, userName: 'HAL 太郎' },
  deliveries: [
    {
      notificationPushDeliveryId: 9012,
      platform: 'ios' as const,
      status: 'failed' as const,
      attemptCount: 2,
      lastAttemptAt: date,
      sentAt: null,
    },
  ],
};

const pushDetail = {
  notificationPushDeliveryId: 9012,
  notificationRecipientId: 1201,
  firebaseTokenId: null,
  platform: 'ios' as const,
  status: 'failed' as const,
  attemptCount: 2,
  firstAttemptAt: date,
  lastAttemptAt: date,
  nextRetryAt: null,
  sentAt: null,
  failedReason: 'UNREGISTERED',
  fcmMessageId: null,
};

describe('通知契約のDomain literal', () => {
  it('正本のliteralだけを公開する', () => {
    expect(NOTIFICATION_SCHEDULE_STATUSES).toEqual([
      'scheduled',
      'resolving',
      'sending',
      'completed',
      'failed',
      'stopped',
    ]);
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
  });
});

describe('通知契約のRequest schema', () => {
  it('AudienceのRequestとResponseを分離する', () => {
    expect(
      notificationAudienceInputItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
      }).success
    ).toBe(true);
    expect(
      notificationAudienceInputItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
        label: '表示名',
      }).success
    ).toBe(false);
    expect(
      notificationAudienceItemSchema.safeParse({
        type: 'gathering',
        targetId: 51,
        label: null,
      }).success
    ).toBe(true);
    expect(
      notificationAudienceSchema.safeParse({ items: [{ type: 'all' }] }).success
    ).toBe(true);
  });

  it('Create、PATCH、Deliveryを正本の形で受け付ける', () => {
    expect(
      notificationCreateRequestSchema.safeParse({
        content,
        audience: {
          items: [{ type: 'gathering', targetId: 51 }],
        },
        delivery: { type: 'scheduled', sendAt: date },
        importance: 'normal',
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({
        content: { detail: { body: '集合場所が変更になりました。' } },
      }).success
    ).toBe(true);
    expect(
      notificationPatchRequestSchema.safeParse({
        schedule: {
          notificationScheduleId: 501,
          delivery: { type: 'immediate', sendAt: null },
        },
      }).success
    ).toBe(true);
    expect(notificationPatchRequestSchema.safeParse({}).success).toBe(false);
    expect(
      notificationContentPatchSchema.safeParse({ detail: {} }).success
    ).toBe(false);
    expect(
      notificationDeliveryInputSchema.safeParse({
        type: 'immediate',
        sendAt: date,
      }).success
    ).toBe(false);
  });

  it('from/toはoffset付きISO日時、resultsはpage/limitを受け付ける', () => {
    expect(
      notificationDateRangeQuery.safeParse({ from: date, to: date }).success
    ).toBe(true);
    expect(
      notificationDateRangeQuery.safeParse({
        from: '2026-11-07T15:35:00Z',
        to: date,
      }).success
    ).toBe(true);
    expect(
      notificationResultsQuery.safeParse({ page: '2', limit: '50' }).success
    ).toBe(true);
    expect(
      notificationResultsQuery.safeParse({ offset: '0', limit: '50' }).success
    ).toBe(false);
  });
});

describe('管理通知とスケジュールのResponse schema', () => {
  it('管理通知一覧はitemsと軽量contentだけを返す', () => {
    expect(
      adminNotificationListResponseSchema.safeParse({
        items: [
          {
            notificationId: 108,
            content: { push: content.push },
            importance: 'normal',
            creation,
            createdAt: date,
            schedules: [adminListSchedule],
          },
        ],
      }).success
    ).toBe(true);
    expect(
      adminNotificationListResponseSchema.safeParse({
        notifications: [],
        total: 0,
        limit: 50,
        offset: 0,
      }).success
    ).toBe(false);
    expect(
      adminNotificationListResponseSchema.safeParse({
        items: [
          {
            notificationId: 108,
            content,
            importance: 'normal',
            creation,
            createdAt: date,
            schedules: [],
          },
        ],
      }).success
    ).toBe(false);
  });

  it('管理通知詳細だけがdetail・updatedAt・停止情報を持つ', () => {
    expect(
      adminNotificationDetailSchema.safeParse({
        notificationId: 108,
        content,
        importance: 'normal',
        creation,
        createdAt: date,
        updatedAt: date,
        schedules: [adminDetailSchedule],
      }).success
    ).toBe(true);
    expect(
      notificationScheduleSummarySchema.safeParse({
        ...adminDetailSchedule,
        stop,
      }).success
    ).toBe(true);
  });

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
        createdAt: date,
      }).success
    ).toBe(false);
  });
});

describe('結果・Push・FirebaseのResponse schema', () => {
  it('結果はrecipient単位のdeliveriesとpage paginationを返す', () => {
    expect(
      notificationRecipientResultSchema.safeParse(recipientResult).success
    ).toBe(true);
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

  it('Push詳細は既存の詳細shapeを維持する', () => {
    expect(
      notificationPushDeliveryDetailSchema.safeParse(pushDetail).success
    ).toBe(true);
  });

  it('Firebase tokenはPOST/DELETEともisActiveを持たない', () => {
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

describe('Endpointとerror codeの契約', () => {
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

  it('error responseはHTTP endpointごとのcodeだけを許可する', () => {
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
    expect(() =>
      notificationErrorCodeSchema.parse('NOTIFICATION_AUDIENCE_HAS_NO_TOKENS')
    ).toThrow();
    expect(
      notificationForbiddenErrorResponseSchema.safeParse(conflict).success
    ).toBe(false);
  });
});

describe('Application DTOとOpenAPI schemaの型パリティ', () => {
  it('主要なrequest/response DTOと一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationCreateRequestSchema>
    >().toEqualTypeOf<NotificationCreateRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationCreateResponseSchema>
    >().toEqualTypeOf<NotificationCreateResponseDTO>();
    expectTypeOf<
      z.infer<typeof notificationPatchRequestSchema>
    >().toEqualTypeOf<NotificationPatchRequestDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationListResponseSchema>
    >().toEqualTypeOf<AdminNotificationListResponseDTO>();
    expectTypeOf<
      z.infer<typeof adminNotificationDetailSchema>
    >().toEqualTypeOf<AdminNotificationDetailDTO>();
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
      z.infer<typeof notificationPushDeliveryDetailSchema>
    >().toEqualTypeOf<NotificationPushDeliveryDetailDTO>();
    expectTypeOf<
      z.infer<typeof firebaseTokenRegistrationRequestSchema>
    >().toEqualTypeOf<FirebaseTokenRegistrationRequestDTO>();
    expectTypeOf<
      z.infer<typeof firebaseTokenSchema>
    >().toEqualTypeOf<FirebaseTokenDTO>();
    expectTypeOf<
      z.infer<typeof notificationConfigResponseSchema>
    >().toEqualTypeOf<NotificationConfigDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceCountRequestSchema>
    >().toEqualTypeOf<NotificationAudienceCountRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationAudienceCountResponseSchema>
    >().toEqualTypeOf<NotificationAudienceCountResponseDTO>();
    expectTypeOf<
      z.infer<typeof notificationResendRequestSchema>
    >().toEqualTypeOf<NotificationResendRequestDTO>();
    expectTypeOf<
      z.infer<typeof notificationStopResponseSchema>
    >().toEqualTypeOf<NotificationStopResponseDTO>();
  });

  it('recipient resultのitemもApplication DTOと一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationRecipientResultSchema>
    >().toEqualTypeOf<NotificationRecipientResultDTO>();
  });
});
