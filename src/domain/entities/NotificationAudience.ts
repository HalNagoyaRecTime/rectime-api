export type NotificationAudienceType =
  | 'all'
  | 'class_room'
  | 'gathering'
  | 'event_participants'
  | 'user'
  | 'users';

export type NotificationAudience =
  | { type: 'all' }
  | { type: 'class_room'; class_room_id: number }
  | { type: 'gathering'; gathering_id: number }
  | { type: 'event_participants'; event_id: number }
  | { type: 'user'; user_id: number }
  | { type: 'users'; user_ids: number[] };

export interface NotificationAudienceShadowWriteInput {
  notification_id: number;
  audience: NotificationAudience;
}
