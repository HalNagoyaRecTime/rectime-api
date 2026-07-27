import type { GatheringGroupDTO } from '../dto/GatheringGroupDTO';

export interface IGatheringGroupService {
  getAllGatheringGroups: () => Promise<GatheringGroupDTO[]>;
  createGatheringGroup: () => Promise<GatheringGroupDTO>;
  deleteGatheringGroup: (gatheringGroupId: number) => Promise<void>;
}
