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

    createGatheringGroup(): Promise<GatheringGroupEntity> {
      return gatheringGroupRepository.create();
    },
  };
}
