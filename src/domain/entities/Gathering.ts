export interface GatheringEntity {
  gathering_id: number;
  event_id: number;
  gathering_spot_id: number;
  gathering_time: string;
  round: number;
  created_at: string;
  updated_at: string;
}

export interface GatheringDetailsEntity extends GatheringEntity {
  event_name: string;
  gathering_spot_name: string;
}

export interface CreateGatheringInput {
  event_id: number;
  gathering_spot_id: number;
  // HH:MM形式。未指定時は未設定を表す99:59を保存する。
  gathering_time?: string;
  round?: number;
}
