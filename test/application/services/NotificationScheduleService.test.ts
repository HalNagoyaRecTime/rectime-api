import { describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleService } from '../../../src/application/services/NotificationScheduleService';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

describe('NotificationScheduleService', () => {
  function setup() {
    const repository: INotificationScheduleRepository = {
      create: vi.fn().mockResolvedValue({ notification_schedule_id: 1 }),
      findAll: vi
        .fn()
        .mockResolvedValue({ notification_schedules: [], total: 0 }),
      findById: vi.fn(),
      deleteDraft: vi.fn(),
      findDraftsByEvent: vi.fn(),
      existsFirebaseToken: vi.fn().mockResolvedValue(true),
      existsEvent: vi.fn().mockResolvedValue(true),
      existsNotification: vi.fn().mockResolvedValue(true),
      findDeliveryCandidateIds: vi.fn(),
      claimForDelivery: vi.fn(),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const userRepository: IUserRepository = {
      isStaffOrTeacher: vi.fn().mockResolvedValue(true),
      getUserCategories: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
    };
    return {
      repository,
      userRepository,
      service: createNotificationScheduleService(repository, userRepository),
    };
  }

  const input = {
    created_user_id: 1,
    event_id: 2,
    notification_id: 4,
    firebase_token_id: 9,
    importance: 2 as const,
    send_at: '2026-07-16T09:00:00.000Z',
  };

  it('staffsまたはteachersだけを管理者として許可する', async () => {
    const { service, userRepository } = setup();
    await expect(service.canManageNotificationSchedules(1)).resolves.toBe(true);
    expect(userRepository.isStaffOrTeacher).toHaveBeenCalledWith(1);
  });

  it('Firebaseトークン・イベント・通知が存在すると作成する', async () => {
    const { repository, service } = setup();
    await service.createNotificationSchedule(input);
    expect(repository.existsFirebaseToken).toHaveBeenCalledWith(9);
    expect(repository.existsEvent).toHaveBeenCalledWith(2);
    expect(repository.existsNotification).toHaveBeenCalledWith(4);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('イベントなしの手動通知ではイベント検証を行わない', async () => {
    const { repository, service } = setup();
    await service.createNotificationSchedule({ ...input, event_id: null });
    expect(repository.existsEvent).not.toHaveBeenCalled();
  });

  it('存在しないFirebaseトークンでは作成しない', async () => {
    const { repository, service } = setup();
    (
      repository.existsFirebaseToken as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);
    await expect(service.createNotificationSchedule(input)).rejects.toThrow(
      'Firebase token not found'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('存在しないイベントでは作成しない', async () => {
    const { repository, service } = setup();
    (repository.existsEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );
    await expect(service.createNotificationSchedule(input)).rejects.toThrow(
      'Event not found'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('一覧条件をRepositoryへ渡す', async () => {
    const { repository, service } = setup();
    const options = {
      send_status: 'draft' as const,
      event_id: 2,
      created_user_id: 1,
      firebase_token_id: 9,
      limit: 20,
      offset: 10,
    };
    await service.getAllNotificationSchedules(options);
    expect(repository.findAll).toHaveBeenCalledWith(options);
  });

  it('存在しない通知予定の詳細取得を拒否する', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getNotificationScheduleById(999)).rejects.toThrow(
      'Notification schedule not found'
    );
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
});
