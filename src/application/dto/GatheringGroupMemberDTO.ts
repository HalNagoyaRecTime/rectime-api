export interface GatheringGroupMemberDTO {
  gathering_group_member_id: number;
  gathering_group_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface AddGatheringGroupMemberRequestDTO {
  userId: number;
}
