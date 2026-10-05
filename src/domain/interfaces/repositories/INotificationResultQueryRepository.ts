import type {
  NotificationPushDeliveryDetail,
  NotificationScheduleResults,
  NotificationResultQueryOptions,
} from '../../entities/NotificationResultQuery';

export interface INotificationResultQueryRepository {
  findScheduleResults(
    notificationScheduleId: number,
    options: NotificationResultQueryOptions
  ): Promise<NotificationScheduleResults | null>;
  findPushDeliveryById(
    notificationPushDeliveryId: number
  ): Promise<NotificationPushDeliveryDetail | null>;
}
