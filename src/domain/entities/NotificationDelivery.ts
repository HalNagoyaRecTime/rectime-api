export const NOTIFICATION_DELIVERY_MESSAGE_SIZE = 15;
export const NOTIFICATION_DELIVERY_CANDIDATE_LIMIT = 5000;
export const NOTIFICATION_DELIVERY_RETRY_DELAY_SECONDS = 5 * 60;
export const NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS = 6 * 60 * 1000;

export interface NotificationDeliveryMessage {
  notificationScheduleIds: number[];
}
