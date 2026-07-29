export interface ApplyEventScheduleInput {
  event_id: number;
  user_id: number;
  event_name?: string;
  rule_text?: string | null;
  venue?: string;
  start_time?: string;
  end_time?: string;
  resolved_event_name: string;
  resolved_venue: string;
  refresh_notifications: boolean;
  notification_enabled: boolean;
  send_at: string;
}

export interface EventNotificationSummaryRecord {
  scheduled_at: string | null;
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}

export interface IEventScheduleRepository {
  apply: (input: ApplyEventScheduleInput) => Promise<void>;
  getNotificationSummary: (
    eventId: number
  ) => Promise<EventNotificationSummaryRecord>;
}
