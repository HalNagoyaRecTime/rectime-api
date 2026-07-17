import { GatheringGroupEntity } from '../../domain/entities/GatheringGroup';
import { IGatheringGroupRepository } from '../../domain/interfaces/repositories/IGatheringGroupRepository';
import { IGatheringGroupService } from './IGatheringGroupService';

export function createGatheringGroupService(
  gatheringGroupRepository: IGatheringGroupRepository
): IGatheringGroupService {
  return {
    getAllGatheringGroups(): Promise<GatheringGroupEntity[]> {
      return gatheringGroupRepository.findAll();
    },

    createGatheringGroup(
      gatheringGroupName: string
    ): Promise<GatheringGroupEntity> {
      return gatheringGroupRepository.create(gatheringGroupName);
    },
  };
}
