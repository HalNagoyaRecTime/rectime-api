import type { NotificationPushDeliveryStatus } from './Notification';
import type { FirebasePlatform } from './FirebaseToken';

export interface NotificationResultQueryOptions {
  page: number;
  limit: number;
}

export interface NotificationResultDelivery {
  notification_push_delivery_id: number;
  platform: FirebasePlatform;
  status: NotificationPushDeliveryStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
}

export interface NotificationRecipientResult {
  notification_recipient_id: number;
  user_id: number;
  user_name: string;
  deliveries: NotificationResultDelivery[];
}

export interface NotificationScheduleResults {
  notification_schedule_id: number;
  total_count: number;
  recipients: NotificationRecipientResult[];
}

export interface NotificationPushDeliveryDetail {
  notification_push_delivery_id: number;
  notification_recipient_id: number;
  firebase_token_id: number | null;
  platform: FirebasePlatform;
  status: NotificationPushDeliveryStatus;
  attempt_count: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  failed_reason: string | null;
  fcm_message_id: string | null;
}
