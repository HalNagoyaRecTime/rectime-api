export interface EventEntity {
  f_event_id: number;
  f_event_code: string;
  f_event_name: string;
  f_time: string; // 「0930」などHHMM
  f_duration: string; // 「20」等分単位文字列
  f_place: string;
  f_gather_time: string;
  f_summary: string | null;
}
//Event情報
export interface EventInformationEntity {
  event_id: number;
  event_name: string;
  rule_text: string | null;
  venue: string;
  start_time: string; // JSTのHHMM形式（例: "0930"）
  end_time: string; // JSTのHHMM形式（例: "1745"）
  created_at: string;
  updated_at: string;
}
