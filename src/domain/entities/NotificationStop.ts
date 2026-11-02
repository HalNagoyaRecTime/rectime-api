import type {
  NotificationScheduleStatus,
  NotificationStopReason,
} from './Notification';

export type NotificationStopPolicyCommand =
  { reason: 'manual'; stoppedByUserId: number } | { reason: 'source_deleted' };

export type NotificationStopCommand =
  | { scheduleId: number; reason: 'manual'; stoppedByUserId: number }
  | { scheduleId: number; reason: 'source_deleted' };

export interface NotificationStopPolicy {
  stopped_by_user_id: number | null;
  reason: NotificationStopReason;
  allowed_statuses: NotificationScheduleStatus[];
  now: string;
}

export interface StopNotificationScheduleInput extends NotificationStopPolicy {
  schedule_id: number;
}

export type NotificationStopResult = 'stopped' | 'not_found' | 'not_allowed';
