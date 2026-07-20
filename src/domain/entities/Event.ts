export interface EventEntity {
  event_id: number;
  event_name: string;
  rule_text: string | null;
  venue: string;
  start_time: string; // JSTのHHMM形式（例: "0930"）
  end_time: string; // JSTのHHMM形式（例: "1745"）
  created_at: string;
  updated_at: string;
}

export interface UpdateEventTimesInput {
  start_time: string;
  end_time: string;
}
