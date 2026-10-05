import type { MobileNotificationEntity } from '../../domain/entities/MobileNotification';
import type { IMobileNotificationRepository } from '../../domain/interfaces/repositories/IMobileNotificationRepository';
import type { MobileNotificationDTO } from '../dto/MobileNotificationDTO';
import type { IMobileNotificationService } from './IMobileNotificationService';

function toDTO(notification: MobileNotificationEntity): MobileNotificationDTO {
  return {
    notification_id: notification.id,
    notification_type: notification.type,
    title: notification.title,
    body: notification.body,
    scheduled_at: notification.scheduledAt,
  };
}

export function createMobileNotificationService(
  mobileNotificationRepository: IMobileNotificationRepository
): IMobileNotificationService {
  return {
    async getNotifications(userId, options) {
      const result = await mobileNotificationRepository.findAllForUser({
        userId,
        limit: options.limit,
        offset: options.offset,
      });
      return {
        notifications: result.notifications.map(toDTO),
        total: result.total,
        limit: options.limit,
        offset: options.offset,
      };
    },

    async getNotificationById(notificationId, userId) {
      const notification = await mobileNotificationRepository.findByIdForUser(
        notificationId,
        userId
      );
      if (!notification) {
        throw new Error('Notification not found');
      }
      return toDTO(notification);
    },
  };
}
