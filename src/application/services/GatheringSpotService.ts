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

    async getGatheringSpotById(
      gatheringSpotId: number
    ): Promise<GatheringSpotEntity> {
      const gatheringSpot =
        await gatheringSpotRepository.findById(gatheringSpotId);
      if (!gatheringSpot) throw new Error('Gathering spot not found');
      return gatheringSpot;
    },

    createGatheringSpot(
      gatheringSpotName: string
    ): Promise<GatheringSpotEntity> {
      return gatheringSpotRepository.create(gatheringSpotName);
    },

    async updateGatheringSpot(gatheringSpotId, input) {
      const gatheringSpot = await gatheringSpotRepository.update(
        gatheringSpotId,
        input
      );
      if (!gatheringSpot) throw new Error('Gathering spot not found');
      return gatheringSpot;
    },

    async deleteGatheringSpot(gatheringSpotId: number): Promise<void> {
      if (await gatheringSpotRepository.hasGatherings(gatheringSpotId)) {
        throw new Error('Gathering spot is in use');
      }
      try {
        if (!(await gatheringSpotRepository.delete(gatheringSpotId))) {
          throw new Error('Gathering spot not found');
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('FOREIGN KEY constraint failed')
        ) {
          throw new Error('Gathering spot is in use');
        }
        throw error;
      }
    },
  };
}
