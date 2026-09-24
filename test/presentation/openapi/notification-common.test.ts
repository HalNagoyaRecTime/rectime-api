import { describe, expect, expectTypeOf, it } from 'vitest';
import type { NotificationDateRangeQueryDTO } from '../../../src/application/dto/AdminNotificationDTO';
import type { NotificationScheduleResultsQueryDTO } from '../../../src/application/dto/NotificationScheduleDTO';
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
  notificationAudienceInputItemSchema,
  notificationAudienceInputSchema,
  notificationAudienceItemSchema,
  notificationAudienceSchema,
  notificationContentPatchSchema,
  notificationCreateRequestSchema,
  notificationDateRangeQuery,
  notificationDeliveryInputSchema,
  notificationPatchRequestSchema,
  notificationResultsQuery,
  notificationUtcDateTimeSchema,
} from '../../../src/presentation/openapi/notification';
import { z } from '../../../src/presentation/openapi/schemas';
import { content, date, offsetDate } from './notification.fixtures';

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

describe('通知queryのApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('date rangeとresults queryが一致する', () => {
    expectTypeOf<
      z.infer<typeof notificationDateRangeQuery>
    >().toEqualTypeOf<NotificationDateRangeQueryDTO>();
    expectTypeOf<
      z.infer<typeof notificationResultsQuery>
    >().toEqualTypeOf<NotificationScheduleResultsQueryDTO>();
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

  it('Audienceは重複を拒否し、allは単独指定だけを許可する', () => {
    expect(
      notificationAudienceInputSchema.safeParse({
        items: [
          { type: 'class_room', targetId: 1 },
          { type: 'class_room', targetId: 1 },
        ],
      }).success
    ).toBe(false);
    expect(
      notificationAudienceInputSchema.safeParse({
        items: [{ type: 'all' }, { type: 'user', targetId: 3 }],
      }).success
    ).toBe(false);
    expect(
      notificationAudienceInputSchema.safeParse({
        items: [
          { type: 'class_room', targetId: 1 },
          { type: 'class_room', targetId: 2 },
          { type: 'user', targetId: 3 },
        ],
      }).success
    ).toBe(true);
    expect(
      notificationAudienceInputSchema.safeParse({
        items: [{ type: 'all' }],
      }).success
    ).toBe(true);
  });

  it('Requestはoffset付き日時を許容し、Response日時はUTC Zに固定する', () => {
    expect(notificationUtcDateTimeSchema.safeParse(date).success).toBe(true);
    expect(
      notificationUtcDateTimeSchema.safeParse(offsetDate).success
    ).toBe(false);
    expect(
      notificationUtcDateTimeSchema.safeParse('2026-11-07 06:35:00').success
    ).toBe(false);
    expect(
      notificationDeliveryInputSchema.safeParse({
        type: 'scheduled',
        sendAt: offsetDate,
      }).success
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

  it('from/toは両方省略または時系列順でセット指定する', () => {
    expect(notificationDateRangeQuery.safeParse({}).success).toBe(true);
    expect(
      notificationDateRangeQuery.safeParse({ from: date, to: date }).success
    ).toBe(true);
    expect(
      notificationDateRangeQuery.safeParse({
        from: '2026-11-07T15:00:00+09:00',
        to: '2026-11-07T07:00:00Z',
      }).success
    ).toBe(true);
    expect(
      notificationDateRangeQuery.safeParse({
        from: '2026-11-07T15:00:00+09:00',
        to: '2026-11-07T06:00:00Z',
      }).success
    ).toBe(true);
    expect(
      notificationDateRangeQuery.safeParse({
        from: '2026-11-07T07:00:00Z',
        to: '2026-11-07T15:00:00+09:00',
      }).success
    ).toBe(false);
    expect(notificationDateRangeQuery.safeParse({ from: date }).success).toBe(
      false
    );
    expect(notificationDateRangeQuery.safeParse({ to: date }).success).toBe(
      false
    );
    expect(
      notificationDateRangeQuery.safeParse({
        from: '2026-11-07T15:35:00',
        to: '2026-11-07T16:35:00',
      }).success
    ).toBe(false);
  });

  it('resultsは省略時のpage/limitをdefaultし、範囲を検証する', () => {
    expect(notificationResultsQuery.parse({})).toEqual({ page: 1, limit: 50 });
    expect(notificationResultsQuery.parse({ page: '2', limit: '30' })).toEqual({
      page: 2,
      limit: 30,
    });
    expect(notificationResultsQuery.safeParse({ page: '0' }).success).toBe(
      false
    );
    expect(notificationResultsQuery.safeParse({ limit: '0' }).success).toBe(
      false
    );
    expect(notificationResultsQuery.safeParse({ limit: '101' }).success).toBe(
      false
    );
    expect(
      notificationResultsQuery.safeParse({ offset: '0', limit: '50' }).success
    ).toBe(false);
  });
});
