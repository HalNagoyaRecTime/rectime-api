export interface NotificationEntity {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationInput {
  notification_type: string;
  title: string;
  body: string;
}

export interface UpdateNotificationInput {
  title?: string;
  body?: string;
}

export interface NotificationListOptions {
  notification_type?: string;
  limit: number;
  offset: number;
}

export interface NotificationListResult {
  items: NotificationEntity[];
  total: number;
}
