import type { EventVenueDTO } from './EventDTO';

export const MOBILE_NOTIFICATION_TYPES = [
  'manual',
  'event_reminder',
  'schedule_reminder',
  'schedule_update',
] as const;

export type MobileNotificationType = (typeof MOBILE_NOTIFICATION_TYPES)[number];

export interface MobileNotificationEventDTO {
  event_id: number;
  event_name: string;
  venues: EventVenueDTO[];
  start_time: string;
  end_time: string;
}

export interface MobileNotificationDTO {
  notification_id: number;
  notification_type: MobileNotificationType;
  title: string;
  body: string;
  scheduled_at: string;
  related_event: MobileNotificationEventDTO | null;
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
