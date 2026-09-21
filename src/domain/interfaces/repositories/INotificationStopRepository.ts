import type { NotificationStopReason } from '../../entities/NotificationV3';

export type NotificationStopRepositoryResult =
  'not_found' | 'not_allowed' | 'stopped';

export interface INotificationStopRepository {
  stopSchedule: (
    scheduleId: number,
    stoppedByUserId: number | null,
    reason: NotificationStopReason,
    now: string
  ) => Promise<NotificationStopRepositoryResult>;
}
