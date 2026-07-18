import { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import { IGatheringSpotService } from './IGatheringSpotService';

export function createGatheringSpotService(
  gatheringSpotRepository: IGatheringSpotRepository
): IGatheringSpotService {
  return {
    getAllGatheringSpots(): Promise<GatheringSpotEntity[]> {
      return gatheringSpotRepository.findAll();
    },

    createGatheringSpot(
      gatheringSpotName: string
    ): Promise<GatheringSpotEntity> {
      return gatheringSpotRepository.create(gatheringSpotName);
    },
  };
}
