export interface EventDTO {
  f_event_id: string;
  f_event_code: string;
  f_event_name: string;
  f_time: string;
  f_duration: string;
  f_place: string;
  f_gather_time: string;
  f_summary?: string;
}

export interface EventFilters {
  f_event_code?: string;
  f_time?: string;
  limit?: number;
  offset?: number;
}
