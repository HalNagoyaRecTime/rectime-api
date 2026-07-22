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

    async createGatheringGroup(userId: number): Promise<GatheringGroupEntity> {
      if (!(await gatheringGroupRepository.existsUser(userId))) {
        throw new Error('User not found');
      }
      return gatheringGroupRepository.create(userId);
    },
  };
}
