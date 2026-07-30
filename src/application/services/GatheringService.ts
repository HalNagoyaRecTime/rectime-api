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

    async getGatheringsByEventId(
      eventId: number
    ): Promise<GatheringDetailsEntity[]> {
      if (!(await gatheringRepository.existsEvent(eventId))) {
        throw new Error('Event not found');
      }
      return gatheringRepository.findByEventId(eventId);
    },

    async createGathering(
      input: CreateGatheringInput
    ): Promise<GatheringDetailsEntity> {
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

    async deleteGathering(gatheringId: number): Promise<void> {
      if (!(await gatheringRepository.remove(gatheringId))) {
        throw new Error('Gathering not found');
      }
    },
  };
}
