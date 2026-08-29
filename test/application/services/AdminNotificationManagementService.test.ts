import { describe, expect, it, vi } from 'vitest';
import { createAdminNotificationManagementService } from '../../../src/application/services/AdminNotificationManagementService';
import type { IAdminNotificationRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationRepository';
import type { IAdminNotificationManagementRepository } from '../../../src/domain/interfaces/repositories/IAdminNotificationManagementRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

const draftNotification = {
  notification_id: 10,
  notification_type: 'manual',
  title: '変更前',
  body: '本文',
  scheduled_at: '2026-07-23T09:00:00+09:00',
  related_event_id: null,
  related_event_name: null,
  created_user_id: 1,
  creator_name: '管理者',
  recipient_count: 2,
  audience: { type: 'resolved_recipients' as const, recipient_count: 2 },
  delivery_summary: {
    total: 2,
    draft: 2,
    sending: 0,
    sent: 0,
    failed: 0,
  },
  created_at: '2026-07-20T09:00:00Z',
  updated_at: '2026-07-20T09:00:00Z',
};

function setup() {
  const managementRepository: IAdminNotificationManagementRepository = {
    findAll: vi.fn().mockResolvedValue({ notifications: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(draftNotification),
    update: vi.fn().mockResolvedValue('updated'),
    deleteDraft: vi.fn().mockResolvedValue('deleted'),
  };
  const adminNotificationRepository: IAdminNotificationRepository = {
    getAudienceStatus: vi
      .fn()
      .mockResolvedValue({ exists: true, active_token_count: 2 }),
    create: vi.fn(),
  };
  const userRepository: IUserRepository = {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
    isStaff: vi.fn().mockResolvedValue(true),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    getDeletionStatus: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
  };
  return {
    managementRepository,
    adminNotificationRepository,
    userRepository,
    service: createAdminNotificationManagementService(
      managementRepository,
      adminNotificationRepository,
      userRepository
    ),
  };
}

describe('AdminNotificationManagementService', () => {
  it('staffsまたはteachersだけを管理者として許可する', async () => {
    const { service, userRepository } = setup();

    await expect(service.canManageAdminNotifications(1)).resolves.toBe(true);
    expect(userRepository.isStaffOrTeacher).toHaveBeenCalledWith(1);
  });

  it('一覧条件をRepositoryへ渡す', async () => {
    const { service, managementRepository } = setup();
    const options = {
      send_status: 'draft' as const,
      event_id: 2,
      from: '2026-07-23T08:00:00+09:00',
      to: '2026-07-23T10:00:00+09:00',
      limit: 20,
      offset: 10,
    };

    await service.getAdminNotifications(options);

    expect(managementRepository.findAll).toHaveBeenCalledWith(options);
  });

  it('存在しない通知の詳細取得は拒否する', async () => {
    const { service, managementRepository } = setup();
    (
      managementRepository.findById as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(service.getAdminNotificationById(999)).rejects.toThrow(
      'Admin notification not found'
    );
  });

  it('全件draftなら本文と予定時刻を更新する', async () => {
    const { service, managementRepository } = setup();
    (managementRepository.findById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(draftNotification)
      .mockResolvedValueOnce({
        ...draftNotification,
        title: '変更後',
      });

    await service.updateAdminNotification({
      notification_id: 10,
      title: '変更後',
      scheduled_at: '2026-07-23T10:00:00+09:00',
    });

    expect(managementRepository.update).toHaveBeenCalledWith({
      notification_id: 10,
      title: '変更後',
      scheduled_at: '2026-07-23T10:00:00+09:00',
      created_user_id: 1,
    });
  });

  it('対象変更時は対象を検証し、既存予定時刻を引き継ぐ', async () => {
    const { service, managementRepository, adminNotificationRepository } =
      setup();

    await service.updateAdminNotification({
      notification_id: 10,
      audience: { type: 'class_room', class_room_id: 3 },
    });

    expect(adminNotificationRepository.getAudienceStatus).toHaveBeenCalledWith({
      type: 'class_room',
      class_room_id: 3,
    });
    expect(managementRepository.update).toHaveBeenCalledWith({
      notification_id: 10,
      audience: { type: 'class_room', class_room_id: 3 },
      scheduled_at: draftNotification.scheduled_at,
      created_user_id: 1,
    });
  });

  it('1件でも非draftなら更新を拒否する', async () => {
    const { service, managementRepository } = setup();
    (
      managementRepository.findById as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ...draftNotification,
      delivery_summary: {
        ...draftNotification.delivery_summary,
        draft: 1,
        sending: 1,
      },
    });

    await expect(
      service.updateAdminNotification({
        notification_id: 10,
        title: '変更後',
      })
    ).rejects.toThrow('Only fully draft notifications can be updated');
    expect(managementRepository.update).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'Admin notification not found'],
    ['not_draft', 'Only fully draft notifications can be deleted'],
  ] as const)('削除結果%sをエラーへ変換する', async (result, message) => {
    const { service, managementRepository } = setup();
    (
      managementRepository.deleteDraft as ReturnType<typeof vi.fn>
    ).mockResolvedValue(result);

    await expect(service.deleteAdminNotification(10)).rejects.toThrow(message);
  });
});
