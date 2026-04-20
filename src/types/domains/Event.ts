export interface EventEntity {
  f_event_id: number;
  f_event_code: string;
  f_event_name: string;
  f_time: string;         // 「0930」などHHMM文字列
  f_duration: string;     // 「20」等分単位文字列
  f_place: string;
  f_gather_time: string;
  f_summary: string | null;
}

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
