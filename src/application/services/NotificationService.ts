import type { INotificationRepository } from '../../domain/interfaces/repositories/INotificationRepository';
import type { INotificationService } from './INotificationService';

export function createNotificationService(
  notificationRepository: INotificationRepository
): INotificationService {
  return {
    createNotification(input) {
      return notificationRepository.create(input);
    },

    getNotifications(options) {
      return notificationRepository.findAll(options);
    },

    async getNotificationById(notificationId) {
      const notification =
        await notificationRepository.findById(notificationId);
      if (!notification) throw new Error('Notification not found');
      return notification;
    },

    async updateNotification(notificationId, input) {
      const notification = await notificationRepository.update(
        notificationId,
        input
      );
      if (!notification) throw new Error('Notification not found');
      return notification;
    },
  };
}
