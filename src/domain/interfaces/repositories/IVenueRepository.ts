import {
  UpdateVenueInput,
  VenueEntity,
  VenueListOptions,
  VenuePage,
} from '../../entities/Venue';
import { PlaceImageKey } from '../../entities/PlaceImage';

export interface IVenueRepository {
  findAll: () => Promise<VenueEntity[]>;
  findExistingIds: (venueIds: number[]) => Promise<Set<number>>;
  findPage: (options: VenueListOptions) => Promise<VenuePage>;
  create: (venueName: string) => Promise<VenueEntity>;
  update: (
    venueId: number,
    input: UpdateVenueInput
  ) => Promise<VenueEntity | null>;
  delete: (venueId: number) => Promise<boolean>;
  hasEvents: (venueId: number) => Promise<boolean>;
  findImageKey: (venueId: number) => Promise<PlaceImageKey | null>;
  replaceImageKey: (
    venueId: number,
    currentImageKey: string | null,
    imageKey: string | null
  ) => Promise<boolean>;
}
