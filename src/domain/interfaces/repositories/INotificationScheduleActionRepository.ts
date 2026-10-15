import type {
  NotificationScheduleActionSnapshot,
  ResendNotificationScheduleInput,
  ResendNotificationScheduleResult,
  CancelNotificationScheduleResult,
} from '../../entities/NotificationScheduleAction';

export interface INotificationScheduleActionRepository {
  findActionSnapshot(
    scheduleId: number
  ): Promise<NotificationScheduleActionSnapshot | null>;
  createResend(
    input: ResendNotificationScheduleInput
  ): Promise<ResendNotificationScheduleResult>;
  cancelUnstarted(
    scheduleId: number
  ): Promise<CancelNotificationScheduleResult>;
}
