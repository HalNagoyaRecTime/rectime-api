export type NotificationReadStatus = 'all' | 'read' | 'unread';

export interface NotificationEntity {
  id: number;
  user_id: number | null;
  type: string;
  title: string;
  body: string;
  link_url: string | null;
  resource_type: string | null;
  resource_id: string | null;
  severity: string;
  send_status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationListOptions {
  studentNumber: string;
  readStatus: NotificationReadStatus;
  limit: number;
  offset: number;
}

export interface NotificationListResult {
  notifications: NotificationEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationReadResult {
  notification_id: number;
  is_read: true;
  read_at: string;
}

export interface NotificationReadAllResult {
  updated_count: number;
  read_at: string;
}
