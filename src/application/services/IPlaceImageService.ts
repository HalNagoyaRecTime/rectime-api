import { PlaceImage, StoredImage } from '../../domain/entities/PlaceImage';

export interface IPlaceImageService {
  getVenueImage: (venueId: number) => Promise<StoredImage | null>;
  getGatheringSpotImage: (
    gatheringSpotId: number
  ) => Promise<StoredImage | null>;
  setVenueImage: (venueId: number, image: PlaceImage) => Promise<void>;
  deleteVenueImage: (venueId: number) => Promise<void>;
  setGatheringSpotImage: (
    gatheringSpotId: number,
    image: PlaceImage
  ) => Promise<void>;
  deleteGatheringSpotImage: (gatheringSpotId: number) => Promise<void>;
}
