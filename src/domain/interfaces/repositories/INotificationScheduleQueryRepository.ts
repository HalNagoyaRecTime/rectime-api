import type {
  NotificationScheduleQueryDetail,
  NotificationScheduleQueryOptions,
} from '../../entities/NotificationScheduleQuery';

export interface INotificationScheduleQueryRepository {
  findAll(
    options: NotificationScheduleQueryOptions
  ): Promise<NotificationScheduleQueryDetail[]>;
  findById(
    notificationScheduleId: number
  ): Promise<NotificationScheduleQueryDetail | null>;
}
