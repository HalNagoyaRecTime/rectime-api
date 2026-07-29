import { GatheringGroupMemberEntity } from '../../entities/GatheringGroupMember';

export interface IGatheringGroupMemberRepository {
  existsGathering: (gatheringId: number) => Promise<boolean>;
  existsUser: (userId: number) => Promise<boolean>;
  findByGatheringId: (
    gatheringId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  create: (
    gatheringId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  remove: (gatheringId: number, userId: number) => Promise<boolean>;
}
