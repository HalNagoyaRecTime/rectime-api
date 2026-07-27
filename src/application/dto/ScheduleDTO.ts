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

export interface ScheduleDTO {
  notification_schedules: NotificationSchedule[];
}

export interface ScheduleWriteDTO {
  notification_id: number;
  event_id: number;
}

export interface historyEvent {
  event_id: number;
  event_name: string;
}

export interface historyNotificationSchedule {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  send_time: string;
  event: historyEvent;
}

export interface ScheduleHistoryDTO {
  notifications: historyNotificationSchedule[];
}
