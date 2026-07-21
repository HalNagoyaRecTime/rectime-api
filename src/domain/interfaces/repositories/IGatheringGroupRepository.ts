import { GatheringGroupEntity } from '../../entities/GatheringGroup';

export interface IGatheringGroupRepository {
  findAll: () => Promise<GatheringGroupEntity[]>;
  existsUser: (userId: number) => Promise<boolean>;
  create: (userId: number) => Promise<GatheringGroupEntity>;
}
