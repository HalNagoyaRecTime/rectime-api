import type {
  CreateNotificationInput,
  NotificationEntity,
  NotificationListOptions,
  NotificationListResult,
  UpdateNotificationInput,
} from '../../domain/entities/Notification';

export interface INotificationService {
  createNotification: (
    input: CreateNotificationInput
  ) => Promise<NotificationEntity>;
  getNotifications: (
    options: NotificationListOptions
  ) => Promise<NotificationListResult>;
  getNotificationById: (notificationId: number) => Promise<NotificationEntity>;
  updateNotification: (
    notificationId: number,
    input: UpdateNotificationInput
  ) => Promise<NotificationEntity>;
}
