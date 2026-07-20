import type { EventEntity } from './Event';
import type { NotificationScheduleEntity } from './NotificationSchedule';

export interface UpdateEventScheduleInput {
  event_id: number;
  user_id: number;
  gathering_group_id: number;
  start_time: string;
  end_time: string;
  notification_enabled: boolean;
  event_date: string;
}

export interface EventScheduleResult {
  event: EventEntity;
  notification_enabled: boolean;
  notification_schedule: NotificationScheduleEntity | null;
}
