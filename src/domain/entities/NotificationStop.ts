import type {
  NotificationScheduleStatus,
  NotificationStopReason,
} from './Notification';

export type NotificationStopCommand =
  | { scheduleId: number; reason: 'manual'; stoppedByUserId: number }
  | { scheduleId: number; reason: 'source_deleted' };

export interface StopNotificationScheduleInput {
  schedule_id: number;
  stopped_by_user_id: number | null;
  reason: NotificationStopReason;
  allowed_statuses: NotificationScheduleStatus[];
  now: string;
}

export type NotificationStopResult = 'stopped' | 'not_found' | 'not_allowed';
