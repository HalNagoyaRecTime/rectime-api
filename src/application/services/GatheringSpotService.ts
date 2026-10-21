import { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';
import { GatheringSpotDTO } from '../dto/GatheringSpotDTO';
import { ImageUrlOf, signImageUrls } from './imageUrls';
import { IImageUrlSigner } from '../../domain/interfaces/storages/IImageUrlSigner';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import { DeleteUnusedImage } from './deleteUnusedImage';
import { IGatheringSpotService } from './IGatheringSpotService';

function toGatheringSpotDTO(
  gatheringSpot: GatheringSpotEntity,
  imageUrlOf: ImageUrlOf
): GatheringSpotDTO {
  return {
    gathering_spot_id: gatheringSpot.gathering_spot_id,
    gathering_spot_name: gatheringSpot.gathering_spot_name,
    image_url: imageUrlOf(gatheringSpot.image_key),
    created_at: gatheringSpot.created_at,
    updated_at: gatheringSpot.updated_at,
    lock_version: gatheringSpot.lock_version,
  };
}

export function createGatheringSpotService(
  gatheringSpotRepository: IGatheringSpotRepository,
  deleteUnusedImage: DeleteUnusedImage,
  imageUrlSigner: IImageUrlSigner
): IGatheringSpotService {
  const toDTOs = async (gatheringSpots: GatheringSpotEntity[]) => {
    const imageUrlOf = await signImageUrls(
      imageUrlSigner,
      gatheringSpots.map(gatheringSpot => gatheringSpot.image_key)
    );
    return gatheringSpots.map(gatheringSpot =>
      toGatheringSpotDTO(gatheringSpot, imageUrlOf)
    );
  };
  const toDTO = async (gatheringSpot: GatheringSpotEntity) =>
    (await toDTOs([gatheringSpot]))[0];

  return {
    async getAllGatheringSpots() {
      return toDTOs(await gatheringSpotRepository.findAll());
    },

    async getGatheringSpotPage(options) {
      const page = await gatheringSpotRepository.findPage(options);
      return {
        ...page,
        gathering_spots: await toDTOs(page.gathering_spots),
      };
    },

    async createGatheringSpot(gatheringSpotName: string) {
      return toDTO(await gatheringSpotRepository.create(gatheringSpotName));
    },

    async updateGatheringSpot(gatheringSpotId, input) {
      const gatheringSpot = await gatheringSpotRepository.update(
        gatheringSpotId,
        input
      );
      if (!gatheringSpot) throw new Error('Gathering spot not found');
      return toDTO(gatheringSpot);
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
      await deleteUnusedImage(image?.imageKey ?? null);
    },
  };
}
