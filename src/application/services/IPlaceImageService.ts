import { PlaceImage } from '../../domain/entities/PlaceImage';

export interface IPlaceImageService {
  setVenueImage: (venueId: number, image: PlaceImage) => Promise<void>;
  deleteVenueImage: (venueId: number) => Promise<void>;
  setGatheringSpotImage: (
    gatheringSpotId: number,
    image: PlaceImage
  ) => Promise<void>;
  deleteGatheringSpotImage: (gatheringSpotId: number) => Promise<void>;
}
