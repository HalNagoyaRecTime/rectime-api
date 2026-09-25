import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  timestampSchema,
  unauthorizedResponse,
  z,
} from './schemas';

export const venueResponseSchema = z
  .object({
    venue_id: z.number().int(),
    venue_name: z.string(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('Venue');

export type VenueResponseDTO = z.infer<typeof venueResponseSchema>;

export const venueListResponseSchema = z
  .array(venueResponseSchema)
  .openapi('VenueList');

export const venuePageResponseSchema = z
  .object({
    venues: z.array(venueResponseSchema),
    ...paginationFields,
  })
  .openapi('VenuePage');

export const venueListResultSchema = z
  .union([venueListResponseSchema, venuePageResponseSchema])
  .openapi('VenueListResult');

export const venueIdParams = z.object({
  venueId: positivePathParam('venueId', '実施場所ID'),
});

export const venueWriteSchema = z
  .object({
    venueName: z.string().trim().min(1),
  })
  .openapi('VenueWriteRequest');

export const venueListRoute = createRoute({
  method: 'get',
  path: '/venues',
  tags: ['Venues'],
  summary: '実施場所一覧を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(venueListResultSchema, '実施場所一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const venueCreateRoute = createRoute({
  method: 'post',
  path: '/venues',
  tags: ['Venues'],
  summary: '実施場所を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: venueWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(venueResponseSchema, '作成した実施場所'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const venueUpdateRoute = createRoute({
  method: 'put',
  path: '/venues/{venueId}',
  tags: ['Venues'],
  summary: '実施場所を更新する',
  security: bearerAuth,
  request: {
    params: venueIdParams,
    body: {
      content: { 'application/json': { schema: venueWriteSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(venueResponseSchema, '更新した実施場所'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const venueDeleteRoute = createRoute({
  method: 'delete',
  path: '/venues/{venueId}',
  tags: ['Venues'],
  summary: '実施場所を削除する',
  security: bearerAuth,
  request: { params: venueIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
