import type { GatheringDetailsEntity } from '../../domain/entities/Gathering';
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
  };
}
