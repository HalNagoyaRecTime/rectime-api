import { PlaceImage, PlaceImageKey } from '../../domain/entities/PlaceImage';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';
import { DeleteUnusedImage } from './deleteUnusedImage';
import { IPlaceImageService } from './IPlaceImageService';

export const MAX_PLACE_IMAGE_BYTES = 5 * 1024 * 1024;
export const PLACE_IMAGE_CONFLICT = 'Place image conflict';

const hasBytes = (body: Uint8Array, offset: number, bytes: number[]) =>
  bytes.every((byte, i) => body[offset + i] === byte);

const IMAGE_FORMATS = new Map<
  string,
  { extension: string; matches: (body: Uint8Array) => boolean }
>([
  [
    'image/jpeg',
    {
      extension: 'jpg',
      matches: body => hasBytes(body, 0, [0xff, 0xd8, 0xff]),
    },
  ],
  [
    'image/png',
    {
      extension: 'png',
      matches: body =>
        hasBytes(body, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
  ],
  [
    'image/webp',
    {
      extension: 'webp',
      matches: body =>
        hasBytes(body, 0, [0x52, 0x49, 0x46, 0x46]) &&
        hasBytes(body, 8, [0x57, 0x45, 0x42, 0x50]),
    },
  ],
]);

type PlaceImageTarget = {
  keyPrefix: string;
  notFoundMessage: string;
  findImageKey: (id: number) => Promise<PlaceImageKey | null>;
  replaceImageKey: (
    id: number,
    currentImageKey: string | null,
    imageKey: string | null
  ) => Promise<boolean>;
};

export function createPlaceImageService(
  imageStorage: IImageStorage,
  deleteUnusedImage: DeleteUnusedImage,
  venueRepository: IVenueRepository,
  gatheringSpotRepository: IGatheringSpotRepository
): IPlaceImageService {
  const venues: PlaceImageTarget = {
    keyPrefix: 'venues',
    notFoundMessage: 'Venue not found',
    findImageKey: venueRepository.findImageKey,
    replaceImageKey: venueRepository.replaceImageKey,
  };
  const gatheringSpots: PlaceImageTarget = {
    keyPrefix: 'gathering-spots',
    notFoundMessage: 'Gathering spot not found',
    findImageKey: gatheringSpotRepository.findImageKey,
    replaceImageKey: gatheringSpotRepository.replaceImageKey,
  };

  const setImage = async (
    target: PlaceImageTarget,
    id: number,
    image: PlaceImage
  ) => {
    const format = IMAGE_FORMATS.get(image.contentType);
    if (
      !format ||
      image.body.byteLength > MAX_PLACE_IMAGE_BYTES ||
      !format.matches(new Uint8Array(image.body))
    ) {
      throw new Error('Invalid image');
    }
    const current = await target.findImageKey(id);
    if (!current) throw new Error(target.notFoundMessage);

    const imageKey = `${target.keyPrefix}/${id}/${crypto.randomUUID()}.${format.extension}`;
    await imageStorage.put(imageKey, image.body, image.contentType);
    let replaced = false;
    try {
      replaced = await target.replaceImageKey(id, current.imageKey, imageKey);
    } finally {
      if (!replaced) await imageStorage.delete(imageKey);
    }
    if (!replaced) throw new Error(PLACE_IMAGE_CONFLICT);
    await deleteUnusedImage(current.imageKey);
  };

  const deleteImage = async (target: PlaceImageTarget, id: number) => {
    const current = await target.findImageKey(id);
    if (!current) throw new Error(target.notFoundMessage);
    if (!current.imageKey) return;

    if (!(await target.replaceImageKey(id, current.imageKey, null))) {
      throw new Error(PLACE_IMAGE_CONFLICT);
    }
    await deleteUnusedImage(current.imageKey);
  };

  return {
    setVenueImage: (venueId, image) => setImage(venues, venueId, image),
    deleteVenueImage: venueId => deleteImage(venues, venueId),
    setGatheringSpotImage: (gatheringSpotId, image) =>
      setImage(gatheringSpots, gatheringSpotId, image),
    deleteGatheringSpotImage: gatheringSpotId =>
      deleteImage(gatheringSpots, gatheringSpotId),
  };
}
