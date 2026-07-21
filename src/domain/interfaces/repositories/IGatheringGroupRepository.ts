import { GatheringGroupEntity } from '../../entities/GatheringGroup';

export interface IGatheringGroupRepository {
  findAll: () => Promise<GatheringGroupEntity[]>;
  create: (userId: number) => Promise<GatheringGroupEntity>;
}
