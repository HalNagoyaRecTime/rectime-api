import type { Context } from 'hono';
import { IPlaceImageService } from '../../application/services/IPlaceImageService';
import { PlaceImage, StoredImage } from '../../domain/entities/PlaceImage';
import { ApiErrorDefinition, errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { gatheringSpotIdParams } from '../openapi/gatherings';
import { positivePathParamToNumber } from '../openapi/schemas';
import { venueIdParams } from '../openapi/venues';

type PlaceImageTarget = {
  parseId: (c: Context) => number | undefined;
  invalidIdError: ApiErrorDefinition<400>;
  notFoundMessage: string;
  notFoundError: ApiErrorDefinition<404>;
  getImage: (id: number) => Promise<StoredImage | null>;
  setImage: (id: number, image: PlaceImage) => Promise<void>;
  deleteImage: (id: number) => Promise<void>;
};

function parseVenueId(c: Context): number | undefined {
  const parsed = venueIdParams.safeParse({ venueId: c.req.param('venueId') });
  return parsed.success
    ? positivePathParamToNumber(parsed.data.venueId)
    : undefined;
}

function parseGatheringSpotId(c: Context): number | undefined {
  const parsed = gatheringSpotIdParams.safeParse({
    gatheringSpotId: c.req.param('gatheringSpotId'),
  });
  return parsed.success
    ? positivePathParamToNumber(parsed.data.gatheringSpotId)
    : undefined;
}

export function createPlaceImageController(
  placeImageService: IPlaceImageService
) {
  const venues: PlaceImageTarget = {
    parseId: parseVenueId,
    invalidIdError: EventErrors.INVALID_VENUE_ID,
    notFoundMessage: 'Venue not found',
    notFoundError: EventErrors.VENUE_NOT_FOUND,
    getImage: placeImageService.getVenueImage,
    setImage: placeImageService.setVenueImage,
    deleteImage: placeImageService.deleteVenueImage,
  };
  const gatheringSpots: PlaceImageTarget = {
    parseId: parseGatheringSpotId,
    invalidIdError: EventErrors.INVALID_GATHERING_SPOT_ID,
    notFoundMessage: 'Gathering spot not found',
    notFoundError: EventErrors.GATHERING_SPOT_NOT_FOUND,
    getImage: placeImageService.getGatheringSpotImage,
    setImage: placeImageService.setGatheringSpotImage,
    deleteImage: placeImageService.deleteGatheringSpotImage,
  };

  const getImage = (target: PlaceImageTarget) => async (c: Context) => {
    const id = target.parseId(c);
    if (id === undefined) return errorResponse(c, target.invalidIdError);

    try {
      const image = await target.getImage(id);
      if (!image) return errorResponse(c, EventErrors.PLACE_IMAGE_NOT_FOUND);
      return c.body(image.body, 200, {
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
    } catch {
      return errorResponse(c, EventErrors.PLACE_IMAGE_GET_FAILED);
    }
  };

  const putImage = (target: PlaceImageTarget) => async (c: Context) => {
    const id = target.parseId(c);
    if (id === undefined) return errorResponse(c, target.invalidIdError);

    const image: PlaceImage = {
      body: await c.req.arrayBuffer(),
      contentType: c.req.header('Content-Type') ?? '',
    };
    try {
      await target.setImage(id, image);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid image') {
        return errorResponse(c, EventErrors.INVALID_PLACE_IMAGE);
      }
      if (error instanceof Error && error.message === target.notFoundMessage) {
        return errorResponse(c, target.notFoundError);
      }
      return errorResponse(c, EventErrors.PLACE_IMAGE_UPDATE_FAILED);
    }
  };

  const deleteImage = (target: PlaceImageTarget) => async (c: Context) => {
    const id = target.parseId(c);
    if (id === undefined) return errorResponse(c, target.invalidIdError);

    try {
      await target.deleteImage(id);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === target.notFoundMessage) {
        return errorResponse(c, target.notFoundError);
      }
      return errorResponse(c, EventErrors.PLACE_IMAGE_DELETE_FAILED);
    }
  };

  return {
    getVenueImage: getImage(venues),
    getGatheringSpotImage: getImage(gatheringSpots),
    putVenueImage: putImage(venues),
    deleteVenueImage: deleteImage(venues),
    putGatheringSpotImage: putImage(gatheringSpots),
    deleteGatheringSpotImage: deleteImage(gatheringSpots),
  };
}
