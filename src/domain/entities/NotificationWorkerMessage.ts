export const NOTIFICATION_WORKER_MESSAGE_SIZE = 15;
export const NOTIFICATION_WORKER_SCHEDULE_LIMIT = 5000;
export const NOTIFICATION_WORKER_RETRY_DELAY_SECONDS = 5 * 60;

export interface NotificationWorkerMessage {
  notificationScheduleIds: number[];
}
