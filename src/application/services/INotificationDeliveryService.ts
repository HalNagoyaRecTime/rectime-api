import type { NotificationDeliveryProcessingResult } from '../../domain/entities/NotificationDelivery';

export interface INotificationDeliveryService {
  enqueueReadySchedules: (
    now?: Date
  ) => Promise<NotificationDeliveryProcessingResult>;
  sendQueuedNotifications: (
    notificationScheduleIds: number[],
    now?: Date
  ) => Promise<{ claimed: number; sent: number; failed: number }>;
}
