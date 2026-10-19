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
    async stopSchedule(command, now = new Date()) {
      const result = await repository.stopSchedule({
        schedule_id: command.scheduleId,
        stopped_by_user_id:
          command.reason === 'manual' ? command.stoppedByUserId : null,
        reason: command.reason,
        allowed_statuses:
          command.reason === 'manual' ? ['sending'] : ['resolving', 'sending'],
        now: now.toISOString(),
      });
      if (result === 'not_found')
        throw new NotificationStopError('NOTIFICATION_SCHEDULE_NOT_FOUND');
      if (result === 'not_allowed')
        throw new NotificationStopError(
          'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED'
        );
      return { notificationScheduleId: command.scheduleId, status: 'stopped' };
    },
  };
}
