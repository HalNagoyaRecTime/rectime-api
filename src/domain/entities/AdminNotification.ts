export type ManualNotificationAudience =
  | { type: 'all' }
  | { type: 'class_room'; class_room_id: number }
  | { type: 'gathering'; gathering_id: number }
  | { type: 'event_participants'; event_id: number };

export interface ManualNotificationAudienceStatus {
  exists: boolean;
  active_token_count: number;
}
