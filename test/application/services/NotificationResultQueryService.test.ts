import { describe, expect, it, vi } from 'vitest';
import { createNotificationResultQueryService } from '../../../src/application/services/NotificationResultQueryService';
import type { INotificationResultQueryRepository } from '../../../src/domain/interfaces/repositories/INotificationResultQueryRepository';

describe('NotificationResultQueryService', () => {
  function setup() {
    const repository: INotificationResultQueryRepository = {
      findScheduleResults: vi.fn(),
      findPushDeliveryById: vi.fn(),
    };
    return {
      repository,
      service: createNotificationResultQueryService(repository),
    };
  }

  it('RecipientごとにDelivery配列を返しRecipient数をページ情報へ使う', async () => {
    const { repository, service } = setup();
    (
      repository.findScheduleResults as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      notification_schedule_id: 11,
      total_count: 3,
      recipients: [
        {
          notification_recipient_id: 31,
          user_id: 51,
          user_name: 'Tokenなし',
          deliveries: [],
        },
        {
          notification_recipient_id: 32,
          user_id: 52,
          user_name: '複数Delivery',
          deliveries: [
            {
              notification_push_delivery_id: 71,
              platform: 1,
              status: 'sent',
              attempt_count: 1,
              last_attempt_at: '2026-07-23T00:01:00.000Z',
              sent_at: '2026-07-23T00:01:01.000Z',
            },
            {
              notification_push_delivery_id: 72,
              platform: 2,
              status: 'failed',
              attempt_count: 3,
              last_attempt_at: '2026-07-23T00:02:00.000Z',
              sent_at: null,
            },
          ],
        },
      ],
    });

    await expect(
      service.getScheduleResults(11, { page: 2, limit: 2 })
    ).resolves.toEqual({
      notificationScheduleId: 11,
      recipients: {
        items: [
          {
            notificationRecipientId: 31,
            user: { userId: 51, userName: 'Tokenなし' },
            deliveries: [],
          },
          {
            notificationRecipientId: 32,
            user: { userId: 52, userName: '複数Delivery' },
            deliveries: [
              {
                notificationPushDeliveryId: 71,
                platform: 'ios',
                status: 'sent',
                attemptCount: 1,
                lastAttemptAt: '2026-07-23T00:01:00.000Z',
                sentAt: '2026-07-23T00:01:01.000Z',
              },
              {
                notificationPushDeliveryId: 72,
                platform: 'android',
                status: 'failed',
                attemptCount: 3,
                lastAttemptAt: '2026-07-23T00:02:00.000Z',
                sentAt: null,
              },
            ],
          },
        ],
        pagination: {
          page: 2,
          limit: 2,
          totalCount: 3,
          totalPages: 2,
        },
      },
    });
    expect(repository.findScheduleResults).toHaveBeenCalledWith(11, {
      page: 2,
      limit: 2,
    });
  });

  it('Delivery詳細の全attempt fieldとToken削除後のnullを返す', async () => {
    const { repository, service } = setup();
    (
      repository.findPushDeliveryById as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      notification_push_delivery_id: 72,
      notification_recipient_id: 32,
      firebase_token_id: null,
      platform: 2,
      status: 'retry_wait',
      attempt_count: 3,
      first_attempt_at: '2026-07-23T00:00:00.000Z',
      last_attempt_at: '2026-07-23T00:02:00.000Z',
      next_retry_at: '2026-07-23T00:07:00.000Z',
      sent_at: null,
      failed_reason: 'temporary unavailable',
      fcm_message_id: null,
    });

    await expect(service.getPushDeliveryDetail(72)).resolves.toEqual({
      notificationPushDeliveryId: 72,
      notificationRecipientId: 32,
      firebaseTokenId: null,
      platform: 'android',
      status: 'retry_wait',
      attemptCount: 3,
      firstAttemptAt: '2026-07-23T00:00:00.000Z',
      lastAttemptAt: '2026-07-23T00:02:00.000Z',
      nextRetryAt: '2026-07-23T00:07:00.000Z',
      sentAt: null,
      failedReason: 'temporary unavailable',
      fcmMessageId: null,
    });
  });

  it('ScheduleとDeliveryの不存在をそれぞれnullで返す', async () => {
    const { repository, service } = setup();
    (
      repository.findScheduleResults as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (
      repository.findPushDeliveryById as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(
      service.getScheduleResults(404, { page: 1, limit: 50 })
    ).resolves.toBeNull();
    await expect(service.getPushDeliveryDetail(404)).resolves.toBeNull();
  });
});
