import type {
  NotificationStopResult,
  StopNotificationScheduleInput,
} from '../../entities/NotificationStop';

export interface INotificationStopRepository {
  stopSchedule(
    input: StopNotificationScheduleInput
  ): Promise<NotificationStopResult>;
}
