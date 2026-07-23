export interface GatheringGroupDTO {
  gathering_group_id: number;
  gathering_group_name: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGatheringGroupRequestDTO {
  gatheringGroupName: string;
}
