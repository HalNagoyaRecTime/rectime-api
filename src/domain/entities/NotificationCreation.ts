import type {
  NotificationAudienceType,
  NotificationImportance,
  NotificationSourceType,
} from './Notification';

export type NotificationAudienceTarget =
  | { type: 'all'; target_id: null }
  | {
      type: Exclude<NotificationAudienceType, 'all'>;
      target_id: number;
    };

export interface NotificationCreationCommand {
  created_by_user_id: number | null;
  scheduled_by_user_id: number | null;
  push_title: string;
  push_body: string;
  detail_title: string;
  detail_body: string;
  importance: NotificationImportance;
  send_at: string;
  audiences: NotificationAudienceTarget[];
  source: {
    type: NotificationSourceType;
    id: number;
    hash: string;
  } | null;
  now: string;
  legacy_schedule: {
    created_user_id: number;
    importance: number;
  } | null;
}

export type AutomaticNotificationCreationCommand = Omit<
  NotificationCreationCommand,
  'created_by_user_id' | 'scheduled_by_user_id' | 'source' | 'legacy_schedule'
> & {
  created_by_user_id: null;
  scheduled_by_user_id: null;
  source: NonNullable<NotificationCreationCommand['source']>;
  legacy_schedule: null;
};

export interface NotificationCreationResult {
  notification_id: number;
  notification_schedule_id: number;
}

export type NotificationCreationOutcome =
  | { status: 'created'; result: NotificationCreationResult }
  | { status: 'updated'; result: NotificationCreationResult }
  | { status: 'already_exists' };
