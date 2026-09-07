import type {
  CreateNotificationScheduleInput,
  NotificationScheduleEntity,
  NotificationScheduleListOptions,
  NotificationScheduleListResult,
} from '../../domain/entities/NotificationSchedule';

export interface INotificationScheduleService {
  getAllNotificationSchedules: (
    options: NotificationScheduleListOptions
  ) => Promise<NotificationScheduleListResult>;
  getNotificationScheduleById: (
    notificationScheduleId: number
  ) => Promise<NotificationScheduleEntity>;
  deleteNotificationSchedule: (notificationScheduleId: number) => Promise<void>;
  createNotificationSchedule: (
    input: CreateNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity>;
}
