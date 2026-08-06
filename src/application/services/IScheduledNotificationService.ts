export interface IScheduledNotificationService {
  enqueueDueNotifications: (now?: Date) => Promise<{
    queuedSchedules: number;
    queuedMessages: number;
  }>;
  sendQueuedNotifications: (
    notificationScheduleIds: number[],
    now?: Date
  ) => Promise<{
    checkedEvents: number;
    sent: number;
    failed: number;
  }>;
}
