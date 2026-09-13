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
