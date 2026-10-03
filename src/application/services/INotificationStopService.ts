import type { NotificationStopCommand } from '../../domain/entities/NotificationStop';

export interface INotificationStopService {
  stopSchedule(
    command: NotificationStopCommand,
    now?: Date
  ): Promise<{ notificationScheduleId: number; status: 'stopped' }>;
}
