import type {
  MobileNotificationEntity,
  MobileNotificationListOptions,
  MobileNotificationListResult,
} from '../../entities/MobileNotification';

export interface IMobileNotificationRepository {
  findAllForUser: (
    options: MobileNotificationListOptions
  ) => Promise<MobileNotificationListResult>;
  findByIdForUser: (
    notificationId: number,
    userId: number
  ) => Promise<MobileNotificationEntity | null>;
}
