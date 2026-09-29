import { describe, expect, it, vi } from 'vitest';
import type { AdminNotificationQueryResult } from '../../../src/domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationQueryRepository';
import { createAdminNotificationQueryService } from '../../../src/application/services/AdminNotificationQueryService';

const manualResult: AdminNotificationQueryResult = {
  notification_id: 10,
  push_title: 'Push title',
  push_body: 'Push body',
  detail_title: 'Detail title',
  detail_body: 'Detail body',
  importance: 'normal',
  creation: {
    method: 'manual',
    user: { user_id: 3, user_name: '作成者' },
    source: null,
  },
  created_at: '2026-09-24T09:00:00.000Z',
  updated_at: '2026-09-24T10:00:00.000Z',
  schedules: [
    {
      notification_schedule_id: 11,
      send_at: '2026-09-25T10:00:00.000Z',
      status: 'scheduled',
      stop: null,
      scheduled_by: { user_id: 3, user_name: '作成者' },
      created_at: '2026-09-24T09:00:00.000Z',
      audience: {
        items: [{ type: 'all' }],
        recipient_resolution: { status: 'pending', resolved_count: 3 },
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

function buildRepository(
  overrides: Partial<IAdminNotificationQueryRepository> = {}
): IAdminNotificationQueryRepository {
  return {
    findAll: vi.fn().mockResolvedValue([manualResult]),
    findById: vi.fn().mockResolvedValue(manualResult),
    ...overrides,
  };
}

describe('AdminNotificationQueryService', () => {
  it('一覧はitems shapeと一覧専用contentへ変換する', async () => {
    const repository = buildRepository();
    const service = createAdminNotificationQueryService(repository);

    await expect(
      service.getAdminNotifications({
        from: '2026-09-25T00:00:00.000Z',
        to: '2026-09-25T23:59:59.999Z',
      })
    ).resolves.toEqual({
      items: [
        {
          notificationId: 10,
          content: { push: { title: 'Push title', body: 'Push body' } },
          importance: 'normal',
          creation: {
            method: 'manual',
            user: { userId: 3, userName: '作成者' },
            source: null,
          },
          createdAt: '2026-09-24T09:00:00.000Z',
          schedules: [
            {
              notificationScheduleId: 11,
              sendAt: '2026-09-25T10:00:00.000Z',
              status: 'scheduled',
              scheduledBy: { userId: 3, userName: '作成者' },
              createdAt: '2026-09-24T09:00:00.000Z',
              audience: {
                items: [{ type: 'all' }],
                recipientResolution: {
                  status: 'pending',
                  resolvedCount: 3,
                },
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
    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-09-25T00:00:00.000Z',
      to: '2026-09-25T23:59:59.999Z',
    });
  });

  it('未指定時は当日のJST範囲をQueryへ渡し、Responseへ追加しない', async () => {
    const repository = buildRepository();
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

  it('詳細はdetail本文とstop情報を含める', async () => {
    const result: AdminNotificationQueryResult = {
      ...manualResult,
      schedules: [
        {
          ...manualResult.schedules[0],
          status: 'stopped',
          stop: {
            reason: 'source_deleted',
            stopped_at: '2026-09-25T02:01:00.000Z',
            stopped_by: null,
          },
        },
      ],
    };
    const repository = buildRepository({
      findById: vi.fn().mockResolvedValue(result),
    });
    const service = createAdminNotificationQueryService(repository);

    await expect(service.getAdminNotificationById(10)).resolves.toMatchObject({
      notificationId: 10,
      content: {
        detail: { title: 'Detail title', body: 'Detail body' },
      },
      schedules: [
        {
          stop: {
            reason: 'source_deleted',
            stoppedAt: '2026-09-25T02:01:00.000Z',
            stoppedBy: null,
          },
        },
      ],
    });
    expect(repository.findById).toHaveBeenCalledWith(10);
  });

  it('存在しないNotificationはnullを返す', async () => {
    const repository = buildRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const service = createAdminNotificationQueryService(repository);

    await expect(service.getAdminNotificationById(999)).resolves.toBeNull();
  });
});
