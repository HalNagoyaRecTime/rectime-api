import type {
  NotificationResendRequestDTO,
  NotificationResendResponseDTO,
} from '../dto/NotificationScheduleDTO';

export interface INotificationScheduleActionService {
  resendSchedule(
    scheduleId: number,
    actorUserId: number,
    request: NotificationResendRequestDTO,
    now?: Date
  ): Promise<NotificationResendResponseDTO>;
  cancelSchedule(scheduleId: number): Promise<void>;
}
