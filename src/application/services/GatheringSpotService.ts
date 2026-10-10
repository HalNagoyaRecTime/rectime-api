import { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';
import { GatheringSpotDTO } from '../dto/GatheringSpotDTO';
import { gatheringSpotImageUrl } from './placeImageUrl';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';
import { deleteUnusedImage } from './deleteUnusedImage';
import { IGatheringSpotService } from './IGatheringSpotService';

function toGatheringSpotDTO(
  gatheringSpot: GatheringSpotEntity
): GatheringSpotDTO {
  return {
    gathering_spot_id: gatheringSpot.gathering_spot_id,
    gathering_spot_name: gatheringSpot.gathering_spot_name,
    image_url: gatheringSpotImageUrl(
      gatheringSpot.gathering_spot_id,
      gatheringSpot.image_key
    ),
    created_at: gatheringSpot.created_at,
    updated_at: gatheringSpot.updated_at,
  };
}

export function createGatheringSpotService(
  gatheringSpotRepository: IGatheringSpotRepository,
  imageStorage: IImageStorage
): IGatheringSpotService {
  return {
    async getAllGatheringSpots() {
      return (await gatheringSpotRepository.findAll()).map(toGatheringSpotDTO);
    },

    async getGatheringSpotPage(options) {
      const page = await gatheringSpotRepository.findPage(options);
      return {
        ...page,
        gathering_spots: page.gathering_spots.map(toGatheringSpotDTO),
      };
    },

    async createGatheringSpot(gatheringSpotName: string) {
      return toGatheringSpotDTO(
        await gatheringSpotRepository.create(gatheringSpotName)
      );
    },

    async updateGatheringSpot(gatheringSpotId, input) {
      const gatheringSpot = await gatheringSpotRepository.update(
        gatheringSpotId,
        input
      );
      if (!gatheringSpot) throw new Error('Gathering spot not found');
      return toGatheringSpotDTO(gatheringSpot);
    },

    async deleteGatheringSpot(gatheringSpotId: number): Promise<void> {
      if (await gatheringSpotRepository.hasGatherings(gatheringSpotId)) {
        throw new Error('Gathering spot is in use');
      }
      const image = await gatheringSpotRepository.findImageKey(gatheringSpotId);
      try {
        if (!(await gatheringSpotRepository.delete(gatheringSpotId))) {
          throw new Error('Gathering spot not found');
        }
      } catch (error) {
        const message =
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : error instanceof Error
              ? error.message
              : String(error);
        if (message.includes('FOREIGN KEY constraint failed')) {
          throw new Error('Gathering spot is in use');
        }
        throw error;
      }
      await deleteUnusedImage(imageStorage, image?.imageKey ?? null);
    },
  };
}
