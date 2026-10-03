import type { MobileNotificationEntity } from '../../domain/entities/MobileNotification';
import type { IMobileNotificationRepository } from '../../domain/interfaces/repositories/IMobileNotificationRepository';
import type {
  MobileNotificationDTO,
  MobileNotificationType,
} from '../dto/MobileNotificationDTO';
import type { IMobileNotificationService } from './IMobileNotificationService';

function toMobileNotificationType(type: string): MobileNotificationType {
  switch (type) {
    case 'notification_general':
      return 'manual';
    case 'manual':
    case 'event_reminder':
    case 'schedule_reminder':
    case 'schedule_update':
      return type;
    default:
      throw new Error(`未対応のMobile通知種別です: ${type}`);
  }
}

function toDTO(notification: MobileNotificationEntity): MobileNotificationDTO {
  return {
    notification_id: notification.id,
    notification_type: toMobileNotificationType(notification.type),
    title: notification.title,
    body: notification.body,
    scheduled_at: notification.scheduledAt,
    related_event: notification.relatedEvent
      ? {
          event_id: notification.relatedEvent.id,
          event_name: notification.relatedEvent.name,
          venues: notification.relatedEvent.venues.map(venue => ({
            venue_id: venue.venue_id,
            venue_name: venue.venue_name,
          })),
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
