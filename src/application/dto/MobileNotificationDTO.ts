import type { NotificationType } from '../../domain/entities/Notification';

export interface MobileNotificationDTO {
  notification_id: number;
  notification_type: NotificationType;
  title: string;
  body: string;
  scheduled_at: string;
}

export interface GetMobileNotificationsRequestDTO {
  limit: number;
  offset: number;
}

export interface MobileNotificationListResponseDTO {
  notifications: MobileNotificationDTO[];
  total: number;
  limit: number;
  offset: number;
}
