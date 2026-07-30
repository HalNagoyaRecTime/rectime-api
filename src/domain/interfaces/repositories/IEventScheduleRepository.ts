export interface ApplyEventScheduleInput {
  event_id: number;
  user_id: number;
  event_name: string;
  start_time: string;
  end_time: string;
  notification_enabled: boolean;
  send_at: string;
}

export interface IEventScheduleRepository {
  apply: (input: ApplyEventScheduleInput) => Promise<void>;
}
