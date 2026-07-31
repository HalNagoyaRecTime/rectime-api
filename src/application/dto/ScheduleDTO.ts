export interface ScheduleUpdateDTO {
  create_user_id: number;
  new_event_id: number;
  new_importance: number;
  new_send_at: string; // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
  new_gathering_id: number;
}
