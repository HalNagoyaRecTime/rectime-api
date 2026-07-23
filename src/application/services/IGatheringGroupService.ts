import type {
  CreateGatheringGroupRequestDTO,
  GatheringGroupDTO,
} from '../dto/GatheringGroupDTO';

export interface IGatheringGroupService {
  getAllGatheringGroups: () => Promise<GatheringGroupDTO[]>;
  createGatheringGroup: (
    input: CreateGatheringGroupRequestDTO
  ) => Promise<GatheringGroupDTO>;
  deleteGatheringGroup: (gatheringGroupId: number) => Promise<void>;
}
