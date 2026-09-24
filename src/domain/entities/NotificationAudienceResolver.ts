import type { NotificationAudienceType } from './Notification';

export const NOTIFICATION_AUDIENCE_RESOLVER_SCHEDULE_LIMIT = 100;

export interface NotificationAudienceResolverCandidate {
  notification_schedule_id: number;
  send_status: 'scheduled' | 'resolving';
}

export interface UnresolvedNotificationAudience {
  notification_audience_id: number;
  audience_type: NotificationAudienceType;
  target_id: number | null;
}

export class UnresolvableNotificationAudienceError extends Error {
  constructor(
    readonly audienceId: number,
    message: string
  ) {
    super(message);
    this.name = 'UnresolvableNotificationAudienceError';
  }
}

export interface ResolvedNotificationSchedule {
  notification_schedule_id: number;
  recipient_count: number;
}

export interface NotificationAudienceResolverResult {
  completed_schedules: ResolvedNotificationSchedule[];
  failed_schedule_ids: number[];
}
