import type {
  CreateNotificationScheduleInput,
  NotificationScheduleEntity,
} from '../../domain/entities/NotificationSchedule';

export interface INotificationScheduleService {
  getAllNotificationSchedules: () => Promise<NotificationScheduleEntity[]>;
  createNotificationSchedule: (
    input: CreateNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity>;
}
