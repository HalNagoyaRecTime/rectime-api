import { describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleService } from '../../../src/application/services/NotificationScheduleService';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';

describe('NotificationScheduleService', () => {
  function setup() {
    const repository: INotificationScheduleRepository = {
      create: vi.fn().mockResolvedValue({ notification_send_schedule_id: 1 }),
      findAll: vi.fn().mockResolvedValue([]),
      existsUser: vi.fn().mockResolvedValue(true),
      existsNotification: vi.fn().mockResolvedValue(true),
      existsEventGatheringGroup: vi.fn().mockResolvedValue(true),
      claimDue: vi.fn(),
      findTargetTokens: vi.fn(),
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
    importance: 1,
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
