import { GatheringGroupEntity } from '../../entities/GatheringGroup';

export interface IGatheringGroupRepository {
  findAll: () => Promise<GatheringGroupEntity[]>;
  create: () => Promise<GatheringGroupEntity>;
  exists: (gatheringGroupId: number) => Promise<boolean>;
  hasGathering: (gatheringGroupId: number) => Promise<boolean>;
  remove: (gatheringGroupId: number) => Promise<boolean>;
}
