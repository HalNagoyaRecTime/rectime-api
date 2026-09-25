import { Context } from 'hono';
import { z } from 'zod';
import type { UpdateVenueRequestDTO } from '../../application/dto/UpdateVenueRequestDTO';
import { IVenueService } from '../../application/services/IVenueService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

const venueWriteSchema = z.object({
  venueName: z.string().trim().min(1),
});
const venueIdSchema = z.coerce.number().int().positive();
const venueListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  name: z.string().trim().max(100).optional(),
  sortBy: z.enum(['id', 'name', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export function createVenueController(venueService: IVenueService) {
  const getAllVenues = async (c: Context) => {
    const hasQuery = ['limit', 'offset', 'name', 'sortBy', 'sortOrder'].some(
      key => c.req.query(key) !== undefined
    );
    if (hasQuery) {
      const parsedQuery = venueListQuerySchema.safeParse({
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
        name: c.req.query('name'),
        sortBy: c.req.query('sortBy'),
        sortOrder: c.req.query('sortOrder'),
      });
      if (!parsedQuery.success) {
        return errorResponse(
          c,
          EventErrors.INVALID_VENUE_LIST_QUERY,
          parsedQuery.error.flatten()
        );
      }
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
    const parsedId = venueIdSchema.safeParse(c.req.param('venueId'));
    if (!parsedId.success) {
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
      const venue = await venueService.updateVenue(parsedId.data, {
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
    const parsedId = venueIdSchema.safeParse(c.req.param('venueId'));
    if (!parsedId.success) {
      return errorResponse(c, EventErrors.INVALID_VENUE_ID);
    }
    try {
      await venueService.deleteVenue(parsedId.data);
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
