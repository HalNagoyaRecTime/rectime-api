import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringService } from '../../application/services/IGatheringService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';

const createGatheringSchema = z.object({
  eventId: z.number().int().positive(),
  gatheringSpotId: z.number().int().positive(),
  // HH:MM形式。99:59は集合時刻が未設定であることを表す。
  gatheringTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^99:59$/)
    .optional(),
  round: z.number().int().min(1).max(99).optional(),
});
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

  const createGathering = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const gathering = await gatheringService.createGathering({
        event_id: parsedBody.data.eventId,
        gathering_spot_id: parsedBody.data.gatheringSpotId,
        gathering_time: parsedBody.data.gatheringTime,
        round: parsedBody.data.round,
      });
      return c.json(gathering, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Gathering spot not found'
      ) {
        return errorResponse(c, EventErrors.GATHERING_SPOT_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_CREATE_FAILED);
    }
  };

  const deleteGathering = async (c: Context) => {
    const gatheringId = Number(c.req.param('gatheringId'));
    if (!Number.isInteger(gatheringId) || gatheringId <= 0) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_ID);
    }

    try {
      await gatheringService.deleteGathering(gatheringId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Gathering not found') {
        return errorResponse(c, EventErrors.GATHERING_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_DELETE_FAILED);
    }
  };

  return {
    getAllGatherings,
    getGatheringsByEventId,
    createGathering,
    deleteGathering,
  };
}
