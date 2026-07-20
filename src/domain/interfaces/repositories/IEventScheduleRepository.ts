export interface ApplyEventScheduleInput {
  event_id: number;
  user_id: number;
  gathering_group_id: number;
  start_time: string;
  end_time: string;
  notification_enabled: boolean;
  notification_title: string;
  notification_body: string;
  send_at: string;
}

export interface IEventScheduleRepository {
  apply: (input: ApplyEventScheduleInput) => Promise<void>;
}
