import type { GatheringGroupDTO } from '../dto/GatheringGroupDTO';
import type { GatheringGroupEntity } from '../../domain/entities/GatheringGroup';
import { IGatheringGroupRepository } from '../../domain/interfaces/repositories/IGatheringGroupRepository';
import { IGatheringGroupService } from './IGatheringGroupService';

export function createGatheringGroupService(
  gatheringGroupRepository: IGatheringGroupRepository
): IGatheringGroupService {
  return {
    async getAllGatheringGroups(): Promise<GatheringGroupDTO[]> {
      return (await gatheringGroupRepository.findAll()).map(toDTO);
    },

    async createGatheringGroup(): Promise<GatheringGroupDTO> {
      return toDTO(await gatheringGroupRepository.create());
    },

    async deleteGatheringGroup(gatheringGroupId: number): Promise<void> {
      if (!(await gatheringGroupRepository.exists(gatheringGroupId))) {
        throw new Error('Gathering group not found');
      }
      if (await gatheringGroupRepository.hasGathering(gatheringGroupId)) {
        throw new Error('Gathering group is assigned to an event');
      }
      if (
        await gatheringGroupRepository.hasNotificationSchedules(
          gatheringGroupId
        )
      ) {
        throw new Error('Gathering group is in use by notification schedules');
      }
      if (!(await gatheringGroupRepository.remove(gatheringGroupId))) {
        throw new Error('Gathering group not found');
      }
    },
  };
}

function toDTO(group: GatheringGroupEntity): GatheringGroupDTO {
  return { ...group };
}
