import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';

export interface IGatheringGroupMemberService {
  getGatheringGroupMembers: (
    gatheringGroupId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  addGatheringGroupMember: (
    gatheringGroupId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  removeGatheringGroupMember: (
    gatheringGroupId: number,
    userId: number
  ) => Promise<boolean>;
}
