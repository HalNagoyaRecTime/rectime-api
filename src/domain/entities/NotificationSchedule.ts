export type NotificationSendStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface NotificationScheduleEntity {
  notification_schedule_id: number;
  created_user_id: number | null;
  event_id: number | null;
  notification_id: number;
  firebase_token_id: number | null;
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

export interface DueNotificationSchedule extends Omit<
  NotificationScheduleEntity,
  'firebase_token_id'
> {
  firebase_token_id: number;
  fcm_token: string;
  platform: 1 | 2;
  is_firebase_active: number;
  // 宛先Userのusers.is_live_active。送信時に無効化済みかどうかを判定する。
  is_user_live_active: number;
}
