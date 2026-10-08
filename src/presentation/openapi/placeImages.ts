import { createRoute } from '@hono/zod-openapi';
import { gatheringSpotIdParams } from './gatherings';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  noContentResponse,
  notFoundResponse,
  unauthorizedResponse,
  z,
} from './schemas';
import { venueIdParams } from './venues';

const imageSchema = z.string().openapi({ format: 'binary' });

const placeImageBody = {
  content: {
    'image/jpeg': { schema: imageSchema },
    'image/png': { schema: imageSchema },
    'image/webp': { schema: imageSchema },
  },
  description: 'JPEG・PNG・WebP形式の5MB以下の画像',
  required: true,
};

const placeImageResponses = {
  204: noContentResponse,
  400: badRequestResponse,
  401: unauthorizedResponse,
  403: forbiddenResponse,
  404: notFoundResponse,
  500: internalServerErrorResponse,
};

export const venueImagePutRoute = createRoute({
  method: 'put',
  path: '/venues/{venueId}/image',
  tags: ['Venues'],
  summary: '実施場所の画像を登録する（登録済みなら差し替える）',
  security: bearerAuth,
  request: { params: venueIdParams, body: placeImageBody },
  responses: placeImageResponses,
});

export const venueImageDeleteRoute = createRoute({
  method: 'delete',
  path: '/venues/{venueId}/image',
  tags: ['Venues'],
  summary: '実施場所の画像を削除する',
  security: bearerAuth,
  request: { params: venueIdParams },
  responses: placeImageResponses,
});

export const gatheringSpotImagePutRoute = createRoute({
  method: 'put',
  path: '/gathering-spots/{gatheringSpotId}/image',
  tags: ['Gathering spots'],
  summary: '集合場所の画像を登録する（登録済みなら差し替える）',
  security: bearerAuth,
  request: { params: gatheringSpotIdParams, body: placeImageBody },
  responses: placeImageResponses,
});

export const gatheringSpotImageDeleteRoute = createRoute({
  method: 'delete',
  path: '/gathering-spots/{gatheringSpotId}/image',
  tags: ['Gathering spots'],
  summary: '集合場所の画像を削除する',
  security: bearerAuth,
  request: { params: gatheringSpotIdParams },
  responses: placeImageResponses,
});
