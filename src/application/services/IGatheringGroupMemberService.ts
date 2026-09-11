import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
import { GatheringMemberSummary } from '../../domain/entities/GatheringMemberSummary';

export interface GatheringMemberSet {
  gathering_id: number;
  members: GatheringMemberSummary[];
}

export interface IGatheringGroupMemberService {
  getGatheringMembers: (gatheringId: number) => Promise<GatheringMemberSet>;
  addGatheringMember: (
    gatheringId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  removeGatheringMember: (
    gatheringId: number,
    userId: number
  ) => Promise<boolean>;
  replaceGatheringMembers: (
    gatheringId: number,
    userIds: number[]
  ) => Promise<GatheringMemberSet>;
}
