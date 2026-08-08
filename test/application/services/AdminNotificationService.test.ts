import { describe, expect, it, vi } from 'vitest';
import { createAdminNotificationService } from '../../../src/application/services/AdminNotificationService';
import type { IAdminNotificationRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

function setup() {
  const adminNotificationRepository: IAdminNotificationRepository = {
    getAudienceStatus: vi
      .fn()
      .mockResolvedValue({ exists: true, active_token_count: 2 }),
    create: vi.fn().mockResolvedValue({
      notification_id: 1,
      schedule_count: 2,
    }),
  };
  const userRepository: IUserRepository = {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
  };
  return {
    adminNotificationRepository,
    userRepository,
    service: createAdminNotificationService(
      adminNotificationRepository,
      userRepository
    ),
  };
}

const input = {
  created_user_id: 1,
  title: '集合場所のお知らせ',
  body: '体育館前へ集合してください。',
  audience: { type: 'all' as const },
  scheduled_at: '2026-07-23T09:00:00+09:00',
};

describe('AdminNotificationService', () => {
  it('staffsまたはteachersだけを作成者として許可する', async () => {
    const { service, userRepository } = setup();

    await expect(service.canCreateManualNotification(1)).resolves.toBe(true);
    expect(userRepository.isStaffOrTeacher).toHaveBeenCalledWith(1);
  });

  it('対象が存在して有効Tokenがあれば一括作成する', async () => {
    const { service, adminNotificationRepository } = setup();

    await service.createManualNotification(input);

    expect(adminNotificationRepository.getAudienceStatus).toHaveBeenCalledWith(
      input.audience
    );
    expect(adminNotificationRepository.create).toHaveBeenCalledWith(input);
  });

  it('存在しない対象では通知を作成しない', async () => {
    const { service, adminNotificationRepository } = setup();
    (
      adminNotificationRepository.getAudienceStatus as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ exists: false, active_token_count: 0 });

    await expect(service.createManualNotification(input)).rejects.toThrow(
      'Notification audience not found'
    );
    expect(adminNotificationRepository.create).not.toHaveBeenCalled();
  });

  it('有効Tokenが0件なら通知本文を作成しない', async () => {
    const { service, adminNotificationRepository } = setup();
    (
      adminNotificationRepository.getAudienceStatus as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ exists: true, active_token_count: 0 });

    await expect(service.createManualNotification(input)).rejects.toThrow(
      'Notification audience has no active Firebase tokens'
    );
    expect(adminNotificationRepository.create).not.toHaveBeenCalled();
  });
});
