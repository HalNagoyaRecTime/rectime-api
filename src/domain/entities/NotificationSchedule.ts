export type NotificationSendStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface NotificationScheduleEntity {
  notification_schedule_id: number;
  created_user_id: number | null;
  event_id: number | null;
  notification_id: number;
  firebase_token_id: number;
  importance: number;
  notification_type: string;
  title: string;
  body: string;
  send_status: NotificationSendStatus;
  fcm_message_id: string | null;
  failed_reason: string | null;
  send_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationScheduleInput {
  created_user_id: number;
  event_id?: number | null;
  notification_id: number;
  firebase_token_id: number;
  /** MVPでは重要度2固定。 */
  importance?: 2;
  /** ISO 8601形式の送信予定日時。例: 2026-07-16T09:00:00.000Z */
  send_at: string;
}

export interface NotificationScheduleListOptions {
  send_status?: NotificationSendStatus;
  event_id?: number;
  created_user_id?: number;
  firebase_token_id?: number;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface NotificationScheduleListResult {
  notification_schedules: NotificationScheduleEntity[];
  total: number;
}

export type DeleteDraftNotificationScheduleResult =
  | 'deleted'
  | 'not_found'
  | 'not_draft';

export interface DueNotificationSchedule extends NotificationScheduleEntity {
  fcm_token: string;
  platform: 1 | 2;
  is_firebase_active: number;
}
