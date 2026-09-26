import type { Context } from 'hono';
import {
  venueIdParams,
  venueListQuery,
  venueWriteSchema,
} from '../openapi/venues';
import { positivePathParamToNumber } from '../openapi/schemas';
import type { UpdateVenueRequestDTO } from '../../application/dto/UpdateVenueRequestDTO';
import { IVenueService } from '../../application/services/IVenueService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

export function createVenueController(venueService: IVenueService) {
  const getAllVenues = async (c: Context) => {
    const query = {
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
      name: c.req.query('name'),
      sortBy: c.req.query('sortBy'),
      sortOrder: c.req.query('sortOrder'),
    };
    const hasQuery = Object.values(query).some(value => value !== undefined);
    const parsedQuery = venueListQuery.safeParse(query);
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_VENUE_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    if (hasQuery) {
      try {
        return c.json(await venueService.getVenuePage(parsedQuery.data), 200);
      } catch {
        return errorResponse(c, EventErrors.VENUE_LIST_FAILED);
      }
    }
    try {
      return c.json(await venueService.getAllVenues(), 200);
    } catch {
      return errorResponse(c, EventErrors.VENUE_LIST_FAILED);
    }
  };
  const createVenue = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = venueWriteSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_VENUE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const venue = await venueService.createVenue(parsedBody.data.venueName);
      return c.json(venue, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Venue name already exists'
      ) {
        return errorResponse(c, EventErrors.VENUE_NAME_ALREADY_EXISTS);
      }
      return errorResponse(c, EventErrors.VENUE_CREATE_FAILED);
    }
  };

  const updateVenue = async (c: Context) => {
    const parsedParams = venueIdParams.safeParse({
      venueId: c.req.param('venueId'),
    });
    const venueId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.venueId)
      : undefined;
    if (venueId === undefined) {
      return errorResponse(c, EventErrors.INVALID_VENUE_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = venueWriteSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_VENUE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    const request: UpdateVenueRequestDTO = parsedBody.data;
    try {
      const venue = await venueService.updateVenue(venueId, {
        venue_name: request.venueName,
      });
      return c.json(venue, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Venue not found') {
        return errorResponse(c, EventErrors.VENUE_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Venue name already exists'
      ) {
        return errorResponse(c, EventErrors.VENUE_NAME_ALREADY_EXISTS);
      }
      return errorResponse(c, EventErrors.VENUE_UPDATE_FAILED);
    }
  };

  const deleteVenue = async (c: Context) => {
    const parsedParams = venueIdParams.safeParse({
      venueId: c.req.param('venueId'),
    });
    const venueId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.venueId)
      : undefined;
    if (venueId === undefined) {
      return errorResponse(c, EventErrors.INVALID_VENUE_ID);
    }
    try {
      await venueService.deleteVenue(venueId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Venue not found') {
        return errorResponse(c, EventErrors.VENUE_NOT_FOUND);
      }
      if (error instanceof Error && error.message === 'Venue is in use') {
        return errorResponse(c, EventErrors.VENUE_IN_USE);
      }
      return errorResponse(c, EventErrors.VENUE_DELETE_FAILED);
    }
  };

  return { getAllVenues, createVenue, updateVenue, deleteVenue };
}
