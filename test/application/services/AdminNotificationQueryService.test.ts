import { describe, expect, it, vi } from 'vitest';
import type { AdminNotificationQueryResult } from '../../../src/domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationQueryRepository';
import { createAdminNotificationQueryService } from '../../../src/application/services/AdminNotificationQueryService';

const notification: AdminNotificationQueryResult = {
  notification_id: 41,
  push_title: 'Push title',
  push_body: 'Push body',
  detail_title: 'Detail title',
  detail_body: 'Detail body',
  importance: 'high',
  creation: {
    method: 'automatic',
    user: null,
    source: { type: 'gathering', id: 51, label: null },
  },
  created_at: '2026-07-23T01:00:00.000Z',
  updated_at: '2026-07-23T01:00:00.000Z',
  schedules: [
    {
      notification_schedule_id: 61,
      send_at: '2026-07-23T02:00:00.000Z',
      status: 'stopped',
      stop: {
        reason: 'source_deleted',
        stopped_at: '2026-07-23T02:01:00.000Z',
        stopped_by: null,
      },
      scheduled_by: null,
      created_at: '2026-07-23T01:01:00.000Z',
      audience: {
        items: [
          { type: 'gathering', target_id: 51, label: null },
          { type: 'user', target_id: 7, label: '利用者7' },
        ],
        recipient_resolution: { status: 'resolved', resolved_count: 3 },
      },
      recipient_push_summary: {
        total_count: 3,
        success_count: 1,
        failed_count: 1,
        no_push_target_count: 1,
      },
    },
  ],
};

function createRepository(): IAdminNotificationQueryRepository {
  return {
    findAll: vi.fn().mockResolvedValue([notification]),
    findById: vi.fn().mockResolvedValue(notification),
  };
}

describe('AdminNotificationQueryService', () => {
  it('一覧DTOを#452 shapeへ組み立てて期間条件を渡す', async () => {
    const repository = createRepository();
    const service = createAdminNotificationQueryService(repository);

    const result = await service.getAdminNotifications({
      from: '2026-07-23T00:00:00+09:00',
      to: '2026-07-23T23:59:59+09:00',
    });

    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00+09:00',
      to: '2026-07-23T23:59:59+09:00',
    });
    expect(result).toEqual({
      items: [
        {
          notificationId: 41,
          content: { push: { title: 'Push title', body: 'Push body' } },
          importance: 'high',
          creation: {
            method: 'automatic',
            user: null,
            source: { type: 'gathering', id: 51, label: null },
          },
          createdAt: '2026-07-23T01:00:00.000Z',
          schedules: [
            {
              notificationScheduleId: 61,
              sendAt: '2026-07-23T02:00:00.000Z',
              status: 'stopped',
              scheduledBy: null,
              createdAt: '2026-07-23T01:01:00.000Z',
              audience: {
                items: [
                  { type: 'gathering', targetId: 51, label: null },
                  { type: 'user', targetId: 7, label: '利用者7' },
                ],
                recipientResolution: { status: 'resolved', resolvedCount: 3 },
              },
              recipientPushSummary: {
                totalCount: 3,
                successCount: 1,
                failedCount: 1,
                noPushTargetCount: 1,
              },
            },
          ],
        },
      ],
    });
  });

  it('未指定時は当日のJST範囲をQueryへ渡し、Responseへ追加しない', async () => {
    const repository = createRepository();
    const service = createAdminNotificationQueryService(
      repository,
      () => new Date('2026-07-23T04:00:00.000Z')
    );

    const result = await service.getAdminNotifications({});

    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-07-23T00:00:00.000+09:00',
      to: '2026-07-23T23:59:59.999+09:00',
    });
    expect(result).not.toHaveProperty('appliedRange');
  });

  it('詳細DTOはdetail本文とstop情報を含める', async () => {
    const service = createAdminNotificationQueryService(createRepository());

    await expect(service.getAdminNotificationById(41)).resolves.toMatchObject({
      notificationId: 41,
      content: {
        push: { title: 'Push title', body: 'Push body' },
        detail: { title: 'Detail title', body: 'Detail body' },
      },
      schedules: [
        {
          stop: {
            reason: 'source_deleted',
            stoppedAt: '2026-07-23T02:01:00.000Z',
            stoppedBy: null,
          },
        },
      ],
    });
  });
});
