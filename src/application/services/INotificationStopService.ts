import type { NotificationStopReason } from '../../domain/entities/NotificationV2';

export type NotificationStopCommand = {
  scheduleId: number;
  stoppedByUserId: number | null;
  reason: NotificationStopReason;
};

export type NotificationStopResult =
  | {
      status: 'stopped';
      notificationScheduleId: number;
    }
  | {
      status: 'not_found' | 'not_allowed';
      notificationScheduleId: number;
    };

export interface INotificationStopService {
  stopSchedule: (
    command: NotificationStopCommand,
    now?: Date
  ) => Promise<NotificationStopResult>;
}
