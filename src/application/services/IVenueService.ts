import {
  UpdateVenueInput,
  VenueEntity,
  VenueListOptions,
  VenuePage,
} from '../../domain/entities/Venue';

export interface IVenueService {
  getAllVenues: () => Promise<VenueEntity[]>;
  getVenuePage: (options: VenueListOptions) => Promise<VenuePage>;
  createVenue: (venueName: string) => Promise<VenueEntity>;
  updateVenue: (
    venueId: number,
    input: UpdateVenueInput
  ) => Promise<VenueEntity>;
  deleteVenue: (venueId: number) => Promise<void>;
}
