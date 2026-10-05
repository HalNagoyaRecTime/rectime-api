import type {
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from './Notification';

export interface NotificationScheduleQueryUserReference {
  user_id: number;
  user_name: string;
}

export interface NotificationScheduleQueryOptions {
  from: string;
  to: string;
}

export type NotificationScheduleQueryCreation =
  | {
      method: 'manual';
      user: NotificationScheduleQueryUserReference | null;
      source: null;
    }
  | {
      method: 'automatic';
      user: null;
      source: {
        type: NotificationSourceType;
        id: number;
        label: string | null;
      };
    };

export interface NotificationScheduleQueryListItem {
  notification_id: number;
  notification_schedule_id: number;
  push_title: string;
  push_body: string;
  importance: NotificationImportance;
  send_at: string;
  status: NotificationScheduleStatus;
  stop: {
    reason: NotificationStopReason;
    stopped_at: string;
    stopped_by: NotificationScheduleQueryUserReference | null;
  } | null;
  creation: NotificationScheduleQueryCreation;
}

export interface NotificationScheduleQueryDetail extends NotificationScheduleQueryListItem {
  audience_progress: {
    total_count: number;
    resolved_count: number;
  };
  recipient_progress: {
    count: number;
    status: 'pending' | 'resolved';
  };
  delivery_progress: {
    total_count: number;
    pending_count: number;
    sending_count: number;
    retry_wait_count: number;
    sent_count: number;
    failed_count: number;
    stopped_count: number;
  };
}
