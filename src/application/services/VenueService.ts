import { VenueEntity } from '../../domain/entities/Venue';
import { VenueDTO } from '../dto/VenueDTO';
import { ImageUrlOf, signImageUrls } from './imageUrls';
import { IImageUrlSigner } from '../../domain/interfaces/storages/IImageUrlSigner';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import { DeleteUnusedImage } from './deleteUnusedImage';
import { IVenueService } from './IVenueService';

function errorChainMessage(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<Error>();
  let current: unknown = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' ');
}

function isVenueNameUniqueError(error: unknown): boolean {
  const message = errorChainMessage(error);
  return message.includes('UNIQUE') && message.includes('venues.venue_name');
}

function toVenueDTO(venue: VenueEntity, imageUrlOf: ImageUrlOf): VenueDTO {
  return {
    venue_id: venue.venue_id,
    venue_name: venue.venue_name,
    image_url: imageUrlOf(venue.image_key),
    created_at: venue.created_at,
    updated_at: venue.updated_at,
    lock_version: venue.lock_version,
  };
}

export function createVenueService(
  venueRepository: IVenueRepository,
  deleteUnusedImage: DeleteUnusedImage,
  imageUrlSigner: IImageUrlSigner
): IVenueService {
  const toDTOs = async (venues: VenueEntity[]) => {
    const imageUrlOf = await signImageUrls(
      imageUrlSigner,
      venues.map(venue => venue.image_key)
    );
    return venues.map(venue => toVenueDTO(venue, imageUrlOf));
  };
  const toDTO = async (venue: VenueEntity) => (await toDTOs([venue]))[0];

  return {
    async getAllVenues() {
      return toDTOs(await venueRepository.findAll());
    },

    async getVenuePage(options) {
      const page = await venueRepository.findPage(options);
      return { ...page, venues: await toDTOs(page.venues) };
    },

    async createVenue(venueName: string) {
      try {
        return await toDTO(await venueRepository.create(venueName));
      } catch (error) {
        if (isVenueNameUniqueError(error)) {
          throw new Error('Venue name already exists');
        }
        throw error;
      }
    },

    async updateVenue(venueId, input) {
      let venue: VenueEntity | null;
      try {
        venue = await venueRepository.update(venueId, input);
      } catch (error) {
        if (isVenueNameUniqueError(error)) {
          throw new Error('Venue name already exists');
        }
        throw error;
      }
      if (!venue) {
        // 版番号を条件にしていた場合、0件更新は削除か版番号の不一致のどちらか。
        // 行の有無は、IVenueRepository にメソッドを足さず findImageKey で確かめる
        // （行があれば画像が無くても非nullを返す）。
        if (
          input.expected_lock_version !== undefined &&
          (await venueRepository.findImageKey(venueId))
        ) {
          throw new Error('Venue update conflict');
        }
        throw new Error('Venue not found');
      }
      return toDTO(venue);
    },

    async deleteVenue(venueId: number): Promise<void> {
      if (await venueRepository.hasEvents(venueId)) {
        throw new Error('Venue is in use');
      }
      const image = await venueRepository.findImageKey(venueId);
      try {
        if (!(await venueRepository.delete(venueId))) {
          throw new Error('Venue not found');
        }
      } catch (error) {
        if (
          errorChainMessage(error).includes('FOREIGN KEY constraint failed')
        ) {
          throw new Error('Venue is in use');
        }
        throw error;
      }
      await deleteUnusedImage(image?.imageKey ?? null);
    },
  };
}
