import { GatheringGroupEntity } from '../../domain/entities/GatheringGroup';

export interface IGatheringGroupService {
  getAllGatheringGroups: () => Promise<GatheringGroupEntity[]>;
  createGatheringGroup: (
    gatheringGroupName: string
  ) => Promise<GatheringGroupEntity>;
}
