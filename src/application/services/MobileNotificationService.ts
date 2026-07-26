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
    sent_at: notification.sentAt,
    related_event: notification.relatedEvent
      ? {
          event_id: notification.relatedEvent.id,
          event_name: notification.relatedEvent.name,
          venue: notification.relatedEvent.venue,
          start_time: notification.relatedEvent.startTime,
          end_time: notification.relatedEvent.endTime,
        }
      : null,
  };
}

export function createMobileNotificationService(
  mobileNotificationRepository: IMobileNotificationRepository
): IMobileNotificationService {
  return {
    async getNotifications(userId, options) {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;
      const result = await mobileNotificationRepository.findAllForUser({
        userId,
        limit,
        offset,
      });
      return {
        notifications: result.notifications.map(toDTO),
        total: result.total,
        limit,
        offset,
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
