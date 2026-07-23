export interface GatheringDTO {
  gathering_id: number;
  gathering_group_id: number;
  event_id: number;
  gathering_spot_id: number;
  gathering_time: string;
  round: number;
  created_at: string;
  updated_at: string;
  gathering_group_name: string;
  event_name: string;
  gathering_spot_name: string;
}

export interface CreateGatheringRequestDTO {
  gatheringGroupId: number;
  eventId: number;
  gatheringSpotId: number;
  gatheringTime?: string;
  round?: number;
}
