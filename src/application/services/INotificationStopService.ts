import type {
  NotificationStopCommand,
  NotificationStopPolicy,
  NotificationStopPolicyCommand,
} from '../../domain/entities/NotificationStop';

export interface INotificationStopService {
  createStopPolicy(
    command: NotificationStopPolicyCommand,
    now?: Date
  ): NotificationStopPolicy;
  stopSchedule(
    command: NotificationStopCommand,
    now?: Date
  ): Promise<{ notificationScheduleId: number; status: 'stopped' }>;
}
