import type { IAdminNotificationRepository } from '../../domain/interfaces/repositories/IAdminNotificationRepository';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAdminNotificationService } from './IAdminNotificationService';

export function createAdminNotificationService(
  adminNotificationRepository: IAdminNotificationRepository,
  userRepository: IUserRepository
): IAdminNotificationService {
  return {
    canCreateManualNotification(userId) {
      return userRepository.isStaffOrTeacher(userId);
    },

    async createManualNotification(input) {
      const audienceStatus =
        await adminNotificationRepository.getAudienceStatus(input.audience);
      if (!audienceStatus.exists) {
        throw new Error('Notification audience not found');
      }
      if (audienceStatus.active_token_count === 0) {
        throw new Error('Notification audience has no active Firebase tokens');
      }
      return adminNotificationRepository.create(input);
    },
  };
}
