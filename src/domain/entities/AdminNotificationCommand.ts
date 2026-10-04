import type {
  NotificationImportance,
  NotificationSourceType,
} from './Notification';
import type { NotificationAudienceTarget } from './NotificationCreation';
export type { NotificationAudienceTarget } from './NotificationCreation';

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
