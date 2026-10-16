import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from './Notification';

export interface AdminNotificationQueryUserReference {
  user_id: number;
  user_name: string;
}

export type AdminNotificationQueryCreation =
  | {
      method: 'manual';
      user: AdminNotificationQueryUserReference | null;
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

export type AdminNotificationQueryAudienceItem =
  | { type: 'all' }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      target_id: number;
      label: string | null;
    };

export interface AdminNotificationQuerySchedule {
  notification_schedule_id: number;
  send_at: string;
  status: NotificationScheduleStatus;
  stop: {
    reason: NotificationStopReason;
    stopped_at: string;
    stopped_by: AdminNotificationQueryUserReference | null;
  } | null;
  scheduled_by: AdminNotificationQueryUserReference | null;
  created_at: string;
  audience: {
    items: AdminNotificationQueryAudienceItem[];
    recipient_resolution: {
      status: 'pending' | 'resolved';
      resolved_count: number;
    };
  };
  recipient_push_summary: {
    total_count: number;
    success_count: number;
    failed_count: number;
    no_push_target_count: number;
  };
}

export interface AdminNotificationQueryResult {
  notification_id: number;
  push_title: string;
  push_body: string;
  detail_title: string;
  detail_body: string;
  importance: NotificationImportance;
  creation: AdminNotificationQueryCreation;
  created_at: string;
  updated_at: string;
  schedules: AdminNotificationQuerySchedule[];
}

export interface AdminNotificationQueryOptions {
  from: string;
  to: string;
}
