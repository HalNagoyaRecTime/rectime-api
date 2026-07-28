export interface MobileNotificationEventDTO {
  event_id: number;
  event_name: string;
  venue: string;
  start_time: string;
  end_time: string;
}

export interface MobileNotificationDTO {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  scheduled_at: string;
  related_event: MobileNotificationEventDTO | null;
}

export interface GetMobileNotificationsRequestDTO {
  limit?: number;
  offset?: number;
}

export interface MobileNotificationListResponseDTO {
  notifications: MobileNotificationDTO[];
  total: number;
  limit: number;
  offset: number;
}
