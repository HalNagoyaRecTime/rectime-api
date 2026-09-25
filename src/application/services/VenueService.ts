import { VenueEntity } from '../../domain/entities/Venue';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
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

export function createVenueService(
  venueRepository: IVenueRepository
): IVenueService {
  return {
    getAllVenues(): Promise<VenueEntity[]> {
      return venueRepository.findAll();
    },

    getVenuePage(options) {
      return venueRepository.findPage(options);
    },

    async createVenue(venueName: string): Promise<VenueEntity> {
      try {
        return await venueRepository.create(venueName);
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
      return venue;
    },

    async deleteVenue(venueId: number): Promise<void> {
      if (await venueRepository.hasEvents(venueId)) {
        throw new Error('Venue is in use');
      }
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
    },
  };
}
