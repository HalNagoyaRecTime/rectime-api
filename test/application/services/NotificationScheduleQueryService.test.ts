import { describe, expect, it, vi } from 'vitest';
import type { NotificationScheduleQueryDetail } from '../../../src/domain/entities/NotificationScheduleQuery';
import type { INotificationScheduleQueryRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleQueryRepository';
import { createNotificationScheduleQueryService } from '../../../src/application/services/NotificationScheduleQueryService';

const detail: NotificationScheduleQueryDetail = {
  notification_id: 41,
  notification_schedule_id: 61,
  push_title: 'Push title',
  push_body: 'Push body',
  importance: 'high',
  send_at: '2026-07-23T02:00:00.000Z',
  status: 'sending',
  stop: null,
  creation: {
    method: 'automatic',
    user: null,
    source: { type: 'gathering', id: 51, label: null },
  },
  audience_progress: { total_count: 3, resolved_count: 2 },
  recipient_progress: { count: 2, status: 'pending' },
  delivery_progress: {
    total_count: 4,
    pending_count: 0,
    sending_count: 0,
    retry_wait_count: 1,
    sent_count: 1,
    failed_count: 1,
    stopped_count: 1,
  },
};

function createRepository(): INotificationScheduleQueryRepository {
  return {
    findAll: vi.fn().mockResolvedValue([detail]),
    findById: vi.fn().mockResolvedValue(detail),
  };
}

describe('NotificationScheduleQueryService', () => {
  it('一覧は軽量なSchedule items shapeを返し、期間をRepositoryへ渡す', async () => {
    const repository = createRepository();
    const service = createNotificationScheduleQueryService(repository);

    const result = await service.getNotificationSchedules({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });

    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });
    expect(result).toEqual({
      items: [
        {
          notificationId: 41,
          notificationScheduleId: 61,
          content: { push: { title: 'Push title', body: 'Push body' } },
          importance: 'high',
          sendAt: '2026-07-23T02:00:00.000Z',
          status: 'sending',
          stop: null,
          creation: {
            method: 'automatic',
            user: null,
            source: { type: 'gathering', id: 51, label: null },
          },
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('audienceProgress');
    expect(result.items[0]).not.toHaveProperty('deliveryProgress');
  });

  it('未指定期間には当日のJST範囲を使い、response metadataを追加しない', async () => {
    const repository = createRepository();
    const service = createNotificationScheduleQueryService(
      repository,
      () => new Date('2026-07-23T04:00:00.000Z')
    );

    const result = await service.getNotificationSchedules({});

    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00.000+09:00',
      to: '2026-07-23T23:59:59.999+09:00',
    });
    expect(result).not.toHaveProperty('appliedRange');
  });

  it('詳細はRecipient数とDelivery内訳を個別に返す', async () => {
    const service = createNotificationScheduleQueryService(createRepository());

    await expect(
      service.getNotificationScheduleById(61)
    ).resolves.toMatchObject({
      notificationId: 41,
      notificationScheduleId: 61,
      recipientProgress: { count: 2, status: 'pending' },
      deliveryProgress: {
        totalCount: 4,
        retryWaitCount: 1,
        sentCount: 1,
        failedCount: 1,
        stoppedCount: 1,
      },
    });
  });
});
