import { describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleService } from '../../../src/application/services/NotificationScheduleService';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';

describe('NotificationScheduleService', () => {
  function setup() {
    const repository: INotificationScheduleRepository = {
      create: vi.fn().mockResolvedValue({ notification_send_schedule_id: 1 }),
      findAll: vi.fn().mockResolvedValue({
        notification_schedules: [],
        total: 0,
      }),
      findById: vi.fn(),
      deleteDraft: vi.fn(),
      findDraftsByEventAndGroup: vi.fn(),
      updateDraft: vi.fn(),
      deleteDraftsByEventAndGroup: vi.fn(),
      existsUser: vi.fn().mockResolvedValue(true),
      existsNotification: vi.fn().mockResolvedValue(true),
      existsEventGatheringGroup: vi.fn().mockResolvedValue(true),
      claimDue: vi.fn(),
      findTargetTokensByGatheringGroupIds: vi.fn(),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    return {
      repository,
      service: createNotificationScheduleService(repository),
    };
  }

  const input = {
    user_id: 1,
    event_id: 2,
    gathering_group_id: 3,
    notification_id: 4,
    importance: 2 as const,
    send_at: '2026-07-16T09:00:00.000Z',
  };

  it('関連するユーザー・イベントと集合グループ・通知が存在すると作成する', async () => {
    const { repository, service } = setup();

    await service.createNotificationSchedule(input);

    expect(repository.existsUser).toHaveBeenCalledWith(1);
    expect(repository.existsEventGatheringGroup).toHaveBeenCalledWith(2, 3);
    expect(repository.existsNotification).toHaveBeenCalledWith(4);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('一覧条件をRepositoryへ渡す', async () => {
    const { repository, service } = setup();
    const options = {
      send_status: 'draft' as const,
      event_id: 2,
      gathering_group_id: 3,
      from: '2026-07-16T08:00:00.000Z',
      to: '2026-07-16T10:00:00.000Z',
      limit: 20,
      offset: 10,
    };

    await service.getAllNotificationSchedules(options);

    expect(repository.findAll).toHaveBeenCalledWith(options);
  });

  it('IDで通知予定を取得する', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      notification_send_schedule_id: 1,
    });

    await service.getNotificationScheduleById(1);

    expect(repository.findById).toHaveBeenCalledWith(1);
  });

  it('存在しない通知予定の詳細取得はNotification schedule not foundを返す', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getNotificationScheduleById(999)).rejects.toThrow(
      'Notification schedule not found'
    );
  });

  it('draftの通知予定を削除する', async () => {
    const { repository, service } = setup();
    (repository.deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(
      'deleted'
    );

    await expect(
      service.deleteNotificationSchedule(1)
    ).resolves.toBeUndefined();
    expect(repository.deleteDraft).toHaveBeenCalledWith(1);
  });

  it.each([
    ['not_found', 'Notification schedule not found'],
    ['not_draft', 'Only draft notification schedules can be deleted'],
  ] as const)('削除結果%sをエラーへ変換する', async (result, message) => {
    const { repository, service } = setup();
    (repository.deleteDraft as ReturnType<typeof vi.fn>).mockResolvedValue(
      result
    );

    await expect(service.deleteNotificationSchedule(1)).rejects.toThrow(
      message
    );
  });

  it('イベントに紐づかない集合グループは作成しない', async () => {
    const { repository, service } = setup();
    (
      repository.existsEventGatheringGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await expect(service.createNotificationSchedule(input)).rejects.toThrow(
      'Gathering group is not assigned to event'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});
