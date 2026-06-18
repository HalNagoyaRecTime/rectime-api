export interface EventDTO {
  event_id: string;
  event_code: string;
  event_name: string;
  time: string;
  duration: string;
  place: string;
  gather_time: string;
  summary?: string;
}
