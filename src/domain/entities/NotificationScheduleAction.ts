import type {
  NotificationScheduleStatus,
  NotificationSourceType,
} from './Notification';

export interface NotificationScheduleActionSnapshot {
  notification_id: number;
  source_type: NotificationSourceType | null;
  source_exists: boolean;
  send_status: NotificationScheduleStatus;
  started_at: string | null;
  recipients_resolved_at: string | null;
  has_recipients: boolean;
}

export interface ResendNotificationScheduleInput {
  schedule_id: number;
  actor_user_id: number;
  send_at: string;
  now: string;
}

export type ResendNotificationScheduleResult =
  | {
      status: 'created';
      notification_id: number;
      notification_schedule_id: number;
    }
  | { status: 'not_found' | 'not_allowed' };

export type CancelNotificationScheduleResult =
  'deleted' | 'not_found' | 'not_allowed';
