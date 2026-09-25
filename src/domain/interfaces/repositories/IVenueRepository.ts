import {
  UpdateVenueInput,
  VenueEntity,
  VenueListOptions,
  VenuePage,
} from '../../entities/Venue';

export interface IVenueRepository {
  findAll: () => Promise<VenueEntity[]>;
  findPage: (options: VenueListOptions) => Promise<VenuePage>;
  create: (venueName: string) => Promise<VenueEntity>;
  update: (
    venueId: number,
    input: UpdateVenueInput
  ) => Promise<VenueEntity | null>;
  delete: (venueId: number) => Promise<boolean>;
  hasEvents: (venueId: number) => Promise<boolean>;
}
