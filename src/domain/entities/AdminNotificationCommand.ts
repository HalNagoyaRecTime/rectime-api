import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationStopReason,
} from './Notification';

export type NotificationAudienceTarget =
  | { type: 'all'; target_id: null }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      target_id: number;
    };

export interface CreateNotificationCommand {
  actor_user_id: number;
  push_title: string;
  push_body: string;
  detail_title: string;
  detail_body: string;
  importance: NotificationImportance;
  send_at: string;
  audiences: NotificationAudienceTarget[];
  now: string;
}

export interface CreateNotificationResult {
  notification_id: number;
  notification_schedule_id: number;
}

export interface NotificationMutationSchedule {
  notification_schedule_id: number;
  started_at: string | null;
}

export interface NotificationMutationSnapshot {
  notification_id: number;
  source_type: NotificationSourceType | null;
  schedules: NotificationMutationSchedule[];
}

export interface UpdateNotificationCommand {
  notification_id: number;
  updated_at: string;
  push_title?: string;
  push_body?: string;
  detail_title?: string;
  detail_body?: string;
  importance?: NotificationImportance;
  schedule?: {
    notification_schedule_id: number;
    send_at?: string;
    audiences?: NotificationAudienceTarget[];
  };
  requires_unstarted_schedules: boolean;
}

export type NotificationMutationResult =
  'updated' | 'not_found' | 'not_allowed' | 'schedule_not_found';

export type NotificationDeleteResult = 'deleted' | 'not_found' | 'not_allowed';

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
