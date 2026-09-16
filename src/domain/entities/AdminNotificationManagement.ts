import type { ManualNotificationAudience } from './AdminNotification';
import type { NotificationSendStatus } from './NotificationSchedule';

export interface AdminNotificationStatusSummary {
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}

export type AdminNotificationAudienceSummary =
  | {
      type: 'event_participants';
      event_id: number;
      recipient_count: number;
    }
  | {
      type: 'resolved_recipients';
      recipient_count: number;
    };

export interface AdminNotificationSummary {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  scheduled_at: string;
  related_event_id: number | null;
  related_event_name: string | null;
  created_user_id: number | null;
  creator_name: string | null;
  recipient_count: number;
  audience: AdminNotificationAudienceSummary;
  delivery_summary: AdminNotificationStatusSummary;
  created_at: string;
  updated_at: string;
}

export interface AdminNotificationListOptions {
  send_status?: NotificationSendStatus;
  event_id?: number;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface AdminNotificationListResult {
  notifications: AdminNotificationSummary[];
  total: number;
}

export interface UpdateAdminNotificationInput {
  notification_id: number;
  title?: string;
  body?: string;
  scheduled_at?: string;
  audience?: ManualNotificationAudience;
  created_user_id: number | null;
}

export type UpdateAdminNotificationResult =
  | 'updated'
  | 'not_found'
  | 'not_draft'
  | 'no_active_tokens';

export type DeleteAdminNotificationResult =
  | 'deleted'
  | 'not_found'
  | 'not_draft';
