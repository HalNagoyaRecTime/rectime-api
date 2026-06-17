import {
  NotificationRepositoryFunctions,
  NotificationServiceFunctions,
  NotificationListOptions,
  NotificationListResult,
  NotificationReadAllResult,
  NotificationReadResult,
} from '../types';

export function createNotificationService(
  notificationRepository: NotificationRepositoryFunctions
): NotificationServiceFunctions {
  return {
    getNotifications(
      options: NotificationListOptions
    ): Promise<NotificationListResult> {
      return notificationRepository.findAllByStudentNumber(options);
    },

    async getUnreadCount(
      studentNumber: string
    ): Promise<{ unread_count: number }> {
      const unreadCount =
        await notificationRepository.countUnreadByStudentNumber(studentNumber);

      return {
        unread_count: unreadCount,
      };
    },

    async markAsRead(
      studentNumber: string,
      notificationId: number
    ): Promise<NotificationReadResult> {
      const result = await notificationRepository.markAsRead(
        studentNumber,
        notificationId
      );

      if (!result) {
        throw new Error('Notification not found');
      }

      return result;
    },

    markAllAsRead(studentNumber: string): Promise<NotificationReadAllResult> {
      return notificationRepository.markAllAsRead(studentNumber);
    },
  };
}
