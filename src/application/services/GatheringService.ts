import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';
import { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import { IGatheringService } from './IGatheringService';

export function createGatheringService(
  gatheringRepository: IGatheringRepository
): IGatheringService {
  return {
    getAllGatherings(): Promise<GatheringDetailsEntity[]> {
      return gatheringRepository.findAll();
    },

    async createGathering(
      input: CreateGatheringInput
    ): Promise<GatheringDetailsEntity> {
      if (
        !(await gatheringRepository.existsGatheringGroup(
          input.gathering_group_id
        ))
      ) {
        throw new Error('Gathering group not found');
      }
      if (!(await gatheringRepository.existsEvent(input.event_id))) {
        throw new Error('Event not found');
      }
      if (
        !(await gatheringRepository.existsGatheringSpot(
          input.gathering_spot_id
        ))
      ) {
        throw new Error('Gathering spot not found');
      }
      return gatheringRepository.create(input);
    },
  };
}
