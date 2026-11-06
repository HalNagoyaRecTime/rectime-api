import type {
  NotificationScheduleQueryDetail,
  NotificationScheduleQueryListItem,
  NotificationScheduleQueryOptions,
} from '../../entities/NotificationScheduleQuery';

export interface INotificationScheduleQueryRepository {
  findAll(
    options: NotificationScheduleQueryOptions
  ): Promise<NotificationScheduleQueryListItem[]>;
  findById(
    notificationScheduleId: number
  ): Promise<NotificationScheduleQueryDetail | null>;
}
