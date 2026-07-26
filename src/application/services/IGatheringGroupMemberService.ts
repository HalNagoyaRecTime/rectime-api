import type {
  AddGatheringGroupMemberRequestDTO,
  GatheringGroupMemberDTO,
} from '../dto/GatheringGroupMemberDTO';

export interface IGatheringGroupMemberService {
  getGatheringGroupMembers: (
    gatheringGroupId: number
  ) => Promise<GatheringGroupMemberDTO[]>;
  addGatheringGroupMember: (
    gatheringGroupId: number,
    input: AddGatheringGroupMemberRequestDTO
  ) => Promise<GatheringGroupMemberDTO>;
  removeGatheringGroupMember: (
    gatheringGroupId: number,
    userId: number
  ) => Promise<boolean>;
}
