export interface MobileNotificationEvent {
  id: number;
  name: string;
  venue: string;
  startTime: string;
  endTime: string;
}

export interface MobileNotificationEntity {
  id: number;
  type: string;
  title: string;
  body: string;
  scheduledAt: string;
  relatedEvent: MobileNotificationEvent | null;
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
