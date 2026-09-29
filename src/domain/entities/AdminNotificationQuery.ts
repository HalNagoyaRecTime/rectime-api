import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from './Notification';

export interface NotificationAudienceSnapshot {
  type: NotificationAudienceType;
  target_id: number | null;
  label: string | null;
  resolved_at: string | null;
}

export interface NotificationUserSnapshot {
  user_id: number;
  user_name: string;
}

export interface NotificationScheduleSnapshot {
  notification_schedule_id: number;
  send_at: string;
  status: NotificationScheduleStatus;
  stop_reason: NotificationStopReason | null;
  stopped_at: string | null;
  stopped_by: NotificationUserSnapshot | null;
  scheduled_by: NotificationUserSnapshot | null;
  created_at: string;
  recipients_resolved_at: string | null;
  audiences: NotificationAudienceSnapshot[];
  recipient_count: number;
  success_count: number;
  failed_count: number;
  no_push_target_count: number;
}

export interface AdminNotificationSnapshot {
  notification_id: number;
  push_title: string;
  push_body: string;
  detail_title: string;
  detail_body: string;
  importance: NotificationImportance;
  source_type: NotificationSourceType | null;
  source_id: number | null;
  source_label: string | null;
  created_by: NotificationUserSnapshot | null;
  created_at: string;
  updated_at: string;
  schedules: NotificationScheduleSnapshot[];
}

export interface AdminNotificationQueryOptions {
  from: string;
  to: string;
}
