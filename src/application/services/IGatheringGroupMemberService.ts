import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';

export interface IGatheringGroupMemberService {
  getGatheringMembers: (
    gatheringId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  replaceGatheringMembers: (
    gatheringId: number,
    userIds: number[]
  ) => Promise<GatheringGroupMemberEntity[]>;
}
