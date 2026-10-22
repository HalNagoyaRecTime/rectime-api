import type {
  NotificationStopCommand,
  NotificationStopPolicy,
  NotificationStopPolicyCommand,
} from '../../domain/entities/NotificationStop';
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

export function buildNotificationStopPolicy(
  command: NotificationStopPolicyCommand,
  now = new Date()
): NotificationStopPolicy {
  return {
    stopped_by_user_id:
      command.reason === 'manual' ? command.stoppedByUserId : null,
    reason: command.reason,
    allowed_statuses:
      command.reason === 'manual' ? ['sending'] : ['resolving', 'sending'],
    now: now.toISOString(),
  };
}

export function createNotificationStopService(
  repository: INotificationStopRepository
): INotificationStopService {
  return {
    createStopPolicy(command, now = new Date()) {
      return buildNotificationStopPolicy(command, now);
    },

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
