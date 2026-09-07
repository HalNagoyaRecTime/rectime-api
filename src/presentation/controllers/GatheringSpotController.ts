import { Context } from 'hono';
import { z } from 'zod';
import type { UpdateGatheringSpotRequestDTO } from '../../application/dto/UpdateGatheringSpotRequestDTO';
import { IGatheringSpotService } from '../../application/services/IGatheringSpotService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

const createGatheringSpotSchema = z.object({
  gatheringSpotName: z.string().trim().min(1),
});
const gatheringSpotIdSchema = z.coerce.number().int().positive();
const gatheringSpotListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  name: z.string().trim().max(100).optional(),
  sortBy: z.enum(['id', 'name', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export function createGatheringSpotController(
  gatheringSpotService: IGatheringSpotService
) {
  const getAllGatheringSpots = async (c: Context) => {
    const hasQuery = ['limit', 'offset', 'name', 'sortBy', 'sortOrder'].some(
      key => c.req.query(key) !== undefined
    );
    if (hasQuery) {
      const parsedQuery = gatheringSpotListQuerySchema.safeParse({
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
        name: c.req.query('name'),
        sortBy: c.req.query('sortBy'),
        sortOrder: c.req.query('sortOrder'),
      });
      if (!parsedQuery.success) {
        return errorResponse(
          c,
          EventErrors.INVALID_GATHERING_SPOT_LIST_QUERY,
          parsedQuery.error.flatten()
        );
      }
      try {
        return c.json(
          await gatheringSpotService.getGatheringSpotPage(parsedQuery.data),
          200
        );
      } catch {
        return errorResponse(c, EventErrors.GATHERING_SPOT_LIST_FAILED);
      }
    }
    try {
      return c.json(await gatheringSpotService.getAllGatheringSpots(), 200);
    } catch {
      return errorResponse(c, EventErrors.GATHERING_SPOT_LIST_FAILED);
    }
  };

  const getGatheringSpotById = async (c: Context) => {
    const parsedId = gatheringSpotIdSchema.safeParse(
      c.req.param('gatheringSpotId')
    );
    if (!parsedId.success) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_SPOT_ID);
    }
    try {
      return c.json(
        await gatheringSpotService.getGatheringSpotById(parsedId.data)
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering spot not found'
      ) {
        return errorResponse(c, EventErrors.GATHERING_SPOT_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_SPOT_FETCH_FAILED);
    }
  };

  const createGatheringSpot = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringSpotSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_SPOT_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const gatheringSpot = await gatheringSpotService.createGatheringSpot(
        parsedBody.data.gatheringSpotName
      );
      return c.json(gatheringSpot, 201);
    } catch {
      return errorResponse(c, EventErrors.GATHERING_SPOT_CREATE_FAILED);
    }
  };

  const updateGatheringSpot = async (c: Context) => {
    const parsedId = gatheringSpotIdSchema.safeParse(
      c.req.param('gatheringSpotId')
    );
    if (!parsedId.success) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_SPOT_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringSpotSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_SPOT_REQUEST,
        parsedBody.error.flatten()
      );
    }

    const request: UpdateGatheringSpotRequestDTO = parsedBody.data;
    try {
      const gatheringSpot = await gatheringSpotService.updateGatheringSpot(
        parsedId.data,
        { gathering_spot_name: request.gatheringSpotName }
      );
      return c.json(gatheringSpot, 200);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering spot not found'
      ) {
        return errorResponse(c, EventErrors.GATHERING_SPOT_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_SPOT_UPDATE_FAILED);
    }
  };

  const deleteGatheringSpot = async (c: Context) => {
    const parsedId = gatheringSpotIdSchema.safeParse(
      c.req.param('gatheringSpotId')
    );
    if (!parsedId.success) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_SPOT_ID);
    }
    try {
      await gatheringSpotService.deleteGatheringSpot(parsedId.data);
      return c.body(null, 204);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering spot not found'
      ) {
        return errorResponse(c, EventErrors.GATHERING_SPOT_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Gathering spot is in use'
      ) {
        return errorResponse(c, EventErrors.GATHERING_SPOT_IN_USE);
      }
      return errorResponse(c, EventErrors.GATHERING_SPOT_DELETE_FAILED);
    }
  };

  return {
    getAllGatheringSpots,
    getGatheringSpotById,
    createGatheringSpot,
    updateGatheringSpot,
    deleteGatheringSpot,
  };
}
