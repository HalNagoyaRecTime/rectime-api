import { VenueEntity } from '../../domain/entities/Venue';
import { VenueDTO } from '../dto/VenueDTO';
import { venueImageUrl } from './placeImageUrl';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';
import { deleteUnusedImage } from './deleteUnusedImage';
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

function toVenueDTO(venue: VenueEntity): VenueDTO {
  return {
    venue_id: venue.venue_id,
    venue_name: venue.venue_name,
    image_url: venueImageUrl(venue.venue_id, venue.image_key),
    created_at: venue.created_at,
    updated_at: venue.updated_at,
  };
}

export function createVenueService(
  venueRepository: IVenueRepository,
  imageStorage: IImageStorage
): IVenueService {
  return {
    async getAllVenues() {
      return (await venueRepository.findAll()).map(toVenueDTO);
    },

    async getVenuePage(options) {
      const page = await venueRepository.findPage(options);
      return { ...page, venues: page.venues.map(toVenueDTO) };
    },

    async createVenue(venueName: string) {
      try {
        return toVenueDTO(await venueRepository.create(venueName));
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
      if (!venue) throw new Error('Venue not found');
      return toVenueDTO(venue);
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
      await deleteUnusedImage(imageStorage, image?.imageKey ?? null);
    },
  };
}
