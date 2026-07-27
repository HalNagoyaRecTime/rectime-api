import type { EventEntity } from './Event';
import type { NotificationScheduleEntity } from './NotificationSchedule';

export interface UpdateEventScheduleInput {
  event_id: number;
  user_id: number;
  event_name?: string;
  rule_text?: string | null;
  venue?: string;
  start_time: string;
  end_time: string;
  notification_enabled: boolean;
  event_date: string;
}

export interface EventScheduleResult {
  event: EventEntity;
  notification_enabled: boolean;
  notification_schedules: NotificationScheduleEntity[];
}

export interface EventNotificationSummary {
  event_id: number;
  scheduled_at: string | null;
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}
