import {
  UpdateVenueInput,
  VenueListOptions,
} from '../../domain/entities/Venue';
import { VenueDTO, VenuePageDTO } from '../dto/VenueDTO';

export interface IVenueService {
  getAllVenues: () => Promise<VenueDTO[]>;
  getVenuePage: (options: VenueListOptions) => Promise<VenuePageDTO>;
  createVenue: (venueName: string) => Promise<VenueDTO>;
  updateVenue: (venueId: number, input: UpdateVenueInput) => Promise<VenueDTO>;
  deleteVenue: (venueId: number) => Promise<void>;
}
