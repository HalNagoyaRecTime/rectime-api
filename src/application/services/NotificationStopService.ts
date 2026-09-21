import type { INotificationStopRepository } from '../../domain/interfaces/repositories/INotificationStopRepository';
import type {
  INotificationStopService,
  NotificationStopCommand,
  NotificationStopResult,
} from './INotificationStopService';

export function createNotificationStopService(deps: {
  repository: INotificationStopRepository;
}): INotificationStopService {
  const { repository } = deps;

  return {
    async stopSchedule(
      command: NotificationStopCommand,
      now = new Date()
    ): Promise<NotificationStopResult> {
      const result = await repository.stopSchedule(
        command.scheduleId,
        command.stoppedByUserId,
        command.reason,
        now.toISOString()
      );
      return {
        status: result,
        notificationScheduleId: command.scheduleId,
      };
    },
  };
}
