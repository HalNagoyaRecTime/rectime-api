import type { NotificationDeliveryProcessingResult } from '../../domain/entities/NotificationDelivery';

export interface INotificationDeliveryService {
  enqueueReadySchedules: (
    now?: Date,
    options?: { manualOnly?: boolean }
  ) => Promise<NotificationDeliveryProcessingResult>;
  sendQueuedNotifications: (
    notificationScheduleIds: number[],
    now?: Date,
    options?: { manualOnly?: boolean }
  ) => Promise<{ claimed: number; sent: number; failed: number }>;
}
