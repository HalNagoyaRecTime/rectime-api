import { describe, expect, it, vi } from 'vitest';
import type { AdminNotificationSnapshot } from '../../../src/domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationQueryRepository';
import { createAdminNotificationQueryService } from '../../../src/application/services/AdminNotificationQueryService';

const manualSnapshot: AdminNotificationSnapshot = {
  notification_id: 10,
  push_title: 'Push title',
  push_body: 'Push body',
  detail_title: 'Detail title',
  detail_body: 'Detail body',
  importance: 'normal',
  source_type: null,
  source_id: null,
  source_label: null,
  created_by: { user_id: 3, user_name: '作成者' },
  created_at: '2026-09-24T09:00:00.000Z',
  updated_at: '2026-09-24T10:00:00.000Z',
  schedules: [
    {
      notification_schedule_id: 11,
      send_at: '2026-09-25T10:00:00.000Z',
      status: 'scheduled',
      stop_reason: null,
      stopped_at: null,
      stopped_by: null,
      scheduled_by: { user_id: 3, user_name: '作成者' },
      created_at: '2026-09-24T09:00:00.000Z',
      recipients_resolved_at: null,
      audiences: [
        { type: 'all', target_id: null, label: null, resolved_at: null },
      ],
      recipient_count: 3,
      success_count: 1,
      failed_count: 1,
      no_push_target_count: 1,
    },
  ],
};

function buildRepository(
  overrides: Partial<IAdminNotificationQueryRepository> = {}
): IAdminNotificationQueryRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(manualSnapshot),
    ...overrides,
  };
}

describe('AdminNotificationQueryService', () => {
  it('一覧DTOはcontent.pushと期間内Scheduleだけを返す', async () => {
    const repository = buildRepository({
      findAll: vi.fn().mockResolvedValue([manualSnapshot]),
    });
    const service = createAdminNotificationQueryService(repository);

    await expect(
      service.getAdminNotifications({
        from: '2026-09-25T00:00:00+09:00',
        to: '2026-09-25T23:59:59+09:00',
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
      from: '2026-09-25T00:00:00+09:00',
      to: '2026-09-25T23:59:59+09:00',
    });
  });

  it('一覧の期間未指定時はJST当日の範囲をRepositoryへ渡す', async () => {
    const repository = buildRepository();
    const service = createAdminNotificationQueryService(
      repository,
      () => new Date('2026-09-24T06:00:00.000Z')
    );

    await service.getAdminNotifications({});

    expect(repository.findAll).toHaveBeenCalledWith({
      from: '2026-09-24T00:00:00.000+09:00',
      to: '2026-09-24T23:59:59.999+09:00',
    });
  });

  it('manual Notification detailをAdminNotificationDetailDTOへ変換する', async () => {
    const repository = buildRepository();
    const service = createAdminNotificationQueryService(repository);

    await expect(service.getNotificationDetail(10)).resolves.toEqual({
      notificationId: 10,
      content: {
        push: { title: 'Push title', body: 'Push body' },
        detail: { title: 'Detail title', body: 'Detail body' },
      },
      importance: 'normal',
      creation: {
        method: 'manual',
        user: { userId: 3, userName: '作成者' },
        source: null,
      },
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-24T10:00:00.000Z',
      schedules: [
        {
          notificationScheduleId: 11,
          sendAt: '2026-09-25T10:00:00.000Z',
          status: 'scheduled',
          stop: null,
          scheduledBy: { userId: 3, userName: '作成者' },
          createdAt: '2026-09-24T09:00:00.000Z',
          audience: {
            items: [{ type: 'all' }],
            recipientResolution: { status: 'pending', resolvedCount: 3 },
          },
          recipientPushSummary: {
            totalCount: 3,
            successCount: 1,
            failedCount: 1,
            noPushTargetCount: 1,
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

    await expect(service.getNotificationDetail(999)).resolves.toBeNull();
  });
});
