export interface IScheduledNotificationService {
  sendScheduledEventNotifications: (now?: Date) => Promise<{
    checkedEvents: number;
    sent: number;
    failed: number;
  }>;
}
