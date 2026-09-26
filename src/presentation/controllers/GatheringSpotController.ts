import type { Context } from 'hono';
import {
  gatheringSpotIdParams,
  gatheringSpotListQuery,
  gatheringSpotWriteSchema,
} from '../openapi/gatherings';
import { positivePathParamToNumber } from '../openapi/schemas';
import type { UpdateGatheringSpotRequestDTO } from '../../application/dto/UpdateGatheringSpotRequestDTO';
import { IGatheringSpotService } from '../../application/services/IGatheringSpotService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

export function createGatheringSpotController(
  gatheringSpotService: IGatheringSpotService
) {
  const getAllGatheringSpots = async (c: Context) => {
    const query = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      name: c.req.query('name'),
      sortBy: c.req.query('sortBy'),
      sortOrder: c.req.query('sortOrder'),
    };
    const hasQuery = Object.values(query).some(value => value !== undefined);
    const parsedQuery = gatheringSpotListQuery.safeParse(query);
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_SPOT_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    if (hasQuery) {
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
  const createGatheringSpot = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = gatheringSpotWriteSchema.safeParse(body);
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
    const parsedParams = gatheringSpotIdParams.safeParse({
      gatheringSpotId: c.req.param('gatheringSpotId'),
    });
    const gatheringSpotId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.gatheringSpotId)
      : undefined;
    if (gatheringSpotId === undefined) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_SPOT_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = gatheringSpotWriteSchema.safeParse(body);
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
        gatheringSpotId,
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
    const parsedParams = gatheringSpotIdParams.safeParse({
      gatheringSpotId: c.req.param('gatheringSpotId'),
    });
    const gatheringSpotId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.gatheringSpotId)
      : undefined;
    if (gatheringSpotId === undefined) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_SPOT_ID);
    }
    try {
      await gatheringSpotService.deleteGatheringSpot(gatheringSpotId);
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
    createGatheringSpot,
    updateGatheringSpot,
    deleteGatheringSpot,
  };
}
