export type NotificationSendStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface NotificationScheduleEntity {
  notification_send_schedule_id: number;
  user_id: number;
  event_id: number;
  gathering_group_id: number;
  notification_id: number;
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
  user_id: number;
  event_id: number;
  gathering_group_id: number;
  notification_id: number;
  /** 通知の重要度。1が最も高く、4が最も低い。 */
  importance?: number;
  /** ISO 8601形式の送信予定日時。例: 2026-07-16T09:00:00.000Z */
  send_at: string;
}

export interface NotificationTargetToken {
  firebase_token_id: number;
  fcm_token: string;
}
