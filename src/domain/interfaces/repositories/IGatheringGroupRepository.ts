import { GatheringGroupEntity } from '../../entities/GatheringGroup';

export interface IGatheringGroupRepository {
  findAll: () => Promise<GatheringGroupEntity[]>;
  create: (gatheringGroupName: string) => Promise<GatheringGroupEntity>;
}
