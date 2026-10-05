import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringService } from '../../application/services/IGatheringService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

const eventIdSchema = z.coerce.number().int().positive();

export function createGatheringController(gatheringService: IGatheringService) {
  const getAllGatherings = async (c: Context) => {
    try {
      return c.json(await gatheringService.getAllGatherings(), 200);
    } catch {
      return errorResponse(c, EventErrors.GATHERING_LIST_FAILED);
    }
  };

  const getGatheringsByEventId = async (c: Context) => {
    const parsedEventId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedEventId.success) {
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    }

    try {
      return c.json(
        await gatheringService.getGatheringsByEventId(parsedEventId.data),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.EVENT_GATHERING_LIST_FAILED);
    }
  };

  return {
    getAllGatherings,
    getGatheringsByEventId,
  };
}
