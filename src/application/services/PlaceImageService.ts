import { PlaceImage, PlaceImageKey } from '../../domain/entities/PlaceImage';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';
import { IPlaceImageService } from './IPlaceImageService';

export const MAX_PLACE_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type PlaceImageTarget = {
  keyPrefix: string;
  notFoundMessage: string;
  findImageKey: (id: number) => Promise<PlaceImageKey | null>;
  updateImageKey: (id: number, imageKey: string | null) => Promise<void>;
};

export function createPlaceImageService(
  imageStorage: IImageStorage,
  venueRepository: IVenueRepository,
  gatheringSpotRepository: IGatheringSpotRepository
): IPlaceImageService {
  const venues: PlaceImageTarget = {
    keyPrefix: 'venues',
    notFoundMessage: 'Venue not found',
    findImageKey: venueRepository.findImageKey,
    updateImageKey: venueRepository.updateImageKey,
  };
  const gatheringSpots: PlaceImageTarget = {
    keyPrefix: 'gathering-spots',
    notFoundMessage: 'Gathering spot not found',
    findImageKey: gatheringSpotRepository.findImageKey,
    updateImageKey: gatheringSpotRepository.updateImageKey,
  };

  const getImage = async (target: PlaceImageTarget, id: number) => {
    const current = await target.findImageKey(id);
    if (!current?.imageKey) return null;
    return imageStorage.get(current.imageKey);
  };

  const setImage = async (
    target: PlaceImageTarget,
    id: number,
    image: PlaceImage
  ) => {
    const extension = IMAGE_EXTENSIONS[image.contentType];
    if (
      !extension ||
      image.body.byteLength === 0 ||
      image.body.byteLength > MAX_PLACE_IMAGE_BYTES
    ) {
      throw new Error('Invalid image');
    }
    const current = await target.findImageKey(id);
    if (!current) throw new Error(target.notFoundMessage);

    const imageKey = `${target.keyPrefix}/${id}/${crypto.randomUUID()}.${extension}`;
    await imageStorage.put(imageKey, image.body, image.contentType);
    await target.updateImageKey(id, imageKey);
    if (current.imageKey) await imageStorage.delete(current.imageKey);
  };

  const deleteImage = async (target: PlaceImageTarget, id: number) => {
    const current = await target.findImageKey(id);
    if (!current) throw new Error(target.notFoundMessage);
    if (!current.imageKey) return;

    await target.updateImageKey(id, null);
    await imageStorage.delete(current.imageKey);
  };

  return {
    getVenueImage: venueId => getImage(venues, venueId),
    getGatheringSpotImage: gatheringSpotId =>
      getImage(gatheringSpots, gatheringSpotId),
    setVenueImage: (venueId, image) => setImage(venues, venueId, image),
    deleteVenueImage: venueId => deleteImage(venues, venueId),
    setGatheringSpotImage: (gatheringSpotId, image) =>
      setImage(gatheringSpots, gatheringSpotId, image),
    deleteGatheringSpotImage: gatheringSpotId =>
      deleteImage(gatheringSpots, gatheringSpotId),
  };
}
