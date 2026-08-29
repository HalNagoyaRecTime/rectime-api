import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';

export interface IGatheringGroupMemberService {
  getGatheringMembers: (
    gatheringId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  addGatheringMember: (
    gatheringId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  removeGatheringMember: (
    gatheringId: number,
    userId: number
  ) => Promise<boolean>;
}
