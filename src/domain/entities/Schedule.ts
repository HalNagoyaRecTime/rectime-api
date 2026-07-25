export interface CreatedUser {
  user_id: number;
  user_name: string;
}

export interface Event {
  event_id: number;
  event_name: string;
  start_time: string;
  end_time: string;
}

export interface DeliverySummary {
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}

export interface NotificationSchedule {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  created_user: CreatedUser;
  event: Event;
  send_time: string;
  delivery_summary: DeliverySummary;
}

export interface ScheduleEntity {
  notification_schedules: NotificationSchedule[];
}
