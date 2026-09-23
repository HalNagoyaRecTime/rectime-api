export const NOTIFICATION_DELIVERY_MESSAGE_SIZE = 15;
export const NOTIFICATION_DELIVERY_CANDIDATE_LIMIT = 5000;
export const NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS = 5 * 60;
export const NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS = 6 * 60 * 1000;

export interface NotificationDeliveryMessage {
  notificationScheduleIds: number[];
}

export const NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT = 100;

export interface NotificationDeliveryScheduleCandidate {
  notification_schedule_id: number;
  send_status: 'resolving' | 'sending';
}

export interface ClaimedNotificationPushDelivery {
  notification_push_delivery_id: number;
  notification_schedule_id: number;
  notification_id: number;
  notification_type: 'notification_general';
  firebase_token_id: number;
  fcm_token: string;
  platform: 1 | 2;
  push_title: string;
  push_body: string;
  importance: 'low' | 'normal' | 'high';
}

export interface NotificationDeliveryProcessingResult {
  queued_schedule_ids: number[];
  completed_schedule_ids: number[];
  failed_schedule_ids: number[];
}
