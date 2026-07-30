export type ManualNotificationAudience =
  | { type: 'all' }
  | { type: 'class_room'; class_room_id: number }
  | { type: 'gathering'; gathering_id: number }
  | { type: 'event_participants'; event_id: number };

export interface CreateAdminNotificationInput {
  created_user_id: number;
  title: string;
  body: string;
  audience: ManualNotificationAudience;
  scheduled_at: string;
}

export interface AdminNotificationCreationResult {
  notification_id: number;
  notification_type: 'manual';
  title: string;
  body: string;
  audience: ManualNotificationAudience;
  scheduled_at: string;
  schedule_count: number;
  send_status: 'draft';
  importance: 2;
  created_user_id: number;
}

export interface ManualNotificationAudienceStatus {
  exists: boolean;
  active_token_count: number;
}
