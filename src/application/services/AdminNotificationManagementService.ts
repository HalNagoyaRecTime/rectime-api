import type { IAdminNotificationRepository } from '../../domain/interfaces/repositories/IAdminNotificationRepository';
import type { IAdminNotificationManagementRepository } from '../../domain/interfaces/repositories/IAdminNotificationManagementRepository';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAdminNotificationManagementService } from './IAdminNotificationManagementService';

export function createAdminNotificationManagementService(
  managementRepository: IAdminNotificationManagementRepository,
  adminNotificationRepository: IAdminNotificationRepository,
  userRepository: IUserRepository
): IAdminNotificationManagementService {
  const getById = async (notificationId: number) => {
    const notification = await managementRepository.findById(notificationId);
    if (!notification) throw new Error('Admin notification not found');
    return notification;
  };

  return {
    canManageAdminNotifications(userId) {
      return userRepository.isStaffOrTeacher(userId);
    },

    getAdminNotifications(options) {
      return managementRepository.findAll(options);
    },

    getAdminNotificationById: getById,

    async updateAdminNotification(command) {
      const current = await getById(command.notification_id);
      if (current.delivery_summary.draft !== current.delivery_summary.total) {
        throw new Error('Only fully draft notifications can be updated');
      }

      if (command.audience) {
        const audienceStatus =
          await adminNotificationRepository.getAudienceStatus(command.audience);
        if (!audienceStatus.exists) {
          throw new Error('Notification audience not found');
        }
        if (audienceStatus.active_token_count === 0) {
          throw new Error(
            'Notification audience has no active Firebase tokens'
          );
        }
      }

      const result = await managementRepository.update({
        ...command,
        scheduled_at:
          command.audience && command.scheduled_at === undefined
            ? current.scheduled_at
            : command.scheduled_at,
        created_user_id: current.created_user_id,
      });
      if (result === 'not_found') {
        throw new Error('Admin notification not found');
      }
      if (result === 'not_draft') {
        throw new Error('Only fully draft notifications can be updated');
      }
      if (result === 'no_active_tokens') {
        throw new Error('Notification audience has no active Firebase tokens');
      }
      return getById(command.notification_id);
    },

    async deleteAdminNotification(notificationId) {
      const result = await managementRepository.deleteDraft(notificationId);
      if (result === 'not_found') {
        throw new Error('Admin notification not found');
      }
      if (result === 'not_draft') {
        throw new Error('Only fully draft notifications can be deleted');
      }
    },
  };
}
