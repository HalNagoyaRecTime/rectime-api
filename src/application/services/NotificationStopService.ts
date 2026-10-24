import { buildNotificationStopPolicy } from '../../domain/entities/notificationStopPolicy';
import type { NotificationStopCommand } from '../../domain/entities/NotificationStop';
import type { INotificationStopRepository } from '../../domain/interfaces/repositories/INotificationStopRepository';
import type { INotificationStopService } from './INotificationStopService';

export class NotificationStopError extends Error {
  constructor(
    readonly code:
      | 'NOTIFICATION_SCHEDULE_NOT_FOUND'
      | 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'
  ) {
    super(code);
    this.name = 'NotificationStopError';
  }
}

export function createNotificationStopService(
  repository: INotificationStopRepository
): INotificationStopService {
  return {
    async stopSchedule(command: NotificationStopCommand, now = new Date()) {
      const policy = buildNotificationStopPolicy(command, now);
      const result = await repository.stopSchedule({
        schedule_id: command.scheduleId,
        ...policy,
      });
      if (result === 'not_found')
        throw new NotificationStopError('NOTIFICATION_SCHEDULE_NOT_FOUND');
      if (result === 'not_allowed')
        throw new NotificationStopError(
          'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'
        );
      return {
        notificationScheduleId: command.scheduleId,
        status: 'stopped',
      };
    },
  };
}
