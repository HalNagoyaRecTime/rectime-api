import { GatheringGroupMemberEntity } from '../../entities/GatheringGroupMember';

export interface IGatheringGroupMemberRepository {
  existsGatheringGroup: (gatheringGroupId: number) => Promise<boolean>;
  existsUser: (userId: number) => Promise<boolean>;
  findByGatheringGroupId: (
    gatheringGroupId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  create: (
    gatheringGroupId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  remove: (gatheringGroupId: number, userId: number) => Promise<boolean>;
}
