export interface GatheringSpotEntity {
  gathering_spot_id: number;
  gathering_spot_name: string;
  created_at: string;
  updated_at: string;
}

export interface GatheringSpotListOptions {
  limit: number;
  offset: number;
  name?: string;
}

export interface GatheringSpotPage {
  gathering_spots: GatheringSpotEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateGatheringSpotInput {
  gathering_spot_name: string;
}
