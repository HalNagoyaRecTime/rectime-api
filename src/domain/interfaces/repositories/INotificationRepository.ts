import type {
  CreateNotificationInput,
  NotificationEntity,
  NotificationListOptions,
  NotificationListResult,
  UpdateNotificationInput,
} from '../../entities/Notification';

export interface INotificationRepository {
  create: (input: CreateNotificationInput) => Promise<NotificationEntity>;
  findAll: (
    options: NotificationListOptions
  ) => Promise<NotificationListResult>;
  findById: (notificationId: number) => Promise<NotificationEntity | null>;
  update: (
    notificationId: number,
    input: UpdateNotificationInput
  ) => Promise<NotificationEntity | null>;
}
