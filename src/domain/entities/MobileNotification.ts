import type { NotificationType } from './Notification';

export interface MobileNotificationEntity {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  scheduledAt: string;
  relatedEvent: MobileNotificationRelatedEvent | null;
}

export interface MobileNotificationRelatedEvent {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  venues: Array<{ id: number; name: string }>;
}

export interface MobileNotificationListOptions {
  userId: number;
  limit: number;
  offset: number;
}

export interface MobileNotificationListResult {
  notifications: MobileNotificationEntity[];
  total: number;
}
