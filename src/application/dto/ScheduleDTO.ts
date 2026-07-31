export interface ScheduleUpdateDTO {
  user_id: number;
  event_id: number;
  importance: number;
  send_at: string; // ISO 8601形式（UTCオフセットを含む）。例: 2026-07-16T09:00:00Z
  gathering_id: number;
}
