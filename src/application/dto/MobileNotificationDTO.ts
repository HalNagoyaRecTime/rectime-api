import type { NotificationType } from '../../domain/entities/Notification';

export interface MobileNotificationDTO {
  notification_id: number;
  notification_type: NotificationType;
  title: string;
  body: string;
  scheduled_at: string;
  related_event: MobileNotificationRelatedEventDTO | null;
}

export interface MobileNotificationRelatedEventDTO {
  event_id: number;
  event_name: string;
  start_time: string;
  end_time: string;
  venues: Array<{ venue_id: number; venue_name: string }>;
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
