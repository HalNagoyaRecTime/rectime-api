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

export interface ScheduleWriteEntity {
  user_id: number;
  notification_id: number;
  firebase_token_id?: number;
  event_id: number;
  importance: number;
  send_at: string; // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
}

export interface ScheduleUpdateEntity {
  user_id: number;
  event_id: number;
  firebase_token_id?: number;
  importance: number;
  send_at: string; // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00.000Z
  gathering_id: number;
}

export class HttpError extends Error {
  constructor(
    public statusCode: 400 | 404 | 409 | 500,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
