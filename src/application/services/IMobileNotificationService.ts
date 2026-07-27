import type {
  GetMobileNotificationsRequestDTO,
  MobileNotificationDTO,
  MobileNotificationListResponseDTO,
} from '../dto/MobileNotificationDTO';

export interface IMobileNotificationService {
  getNotifications: (
    userId: number,
    options: GetMobileNotificationsRequestDTO
  ) => Promise<MobileNotificationListResponseDTO>;
  getNotificationById: (
    notificationId: number,
    userId: number
  ) => Promise<MobileNotificationDTO>;
}
