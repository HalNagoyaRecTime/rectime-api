import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringService } from '../../application/services/IGatheringService';

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
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch gatherings',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getGatheringsByEventId = async (c: Context) => {
    const parsedEventId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedEventId.success) {
      return c.json({ error: 'Invalid event ID' }, 400);
    }

    try {
      return c.json(
        await gatheringService.getGatheringsByEventId(parsedEventId.data),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch event gatherings',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const createGathering = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid gathering request body',
          details: parsedBody.error.flatten(),
        },
        400
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
      if (
        error instanceof Error &&
        ['Event not found', 'Gathering spot not found'].includes(error.message)
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to create gathering',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const deleteGathering = async (c: Context) => {
    const gatheringId = Number(c.req.param('gatheringId'));
    if (!Number.isInteger(gatheringId) || gatheringId <= 0) {
      return c.json({ error: 'Invalid gathering ID' }, 400);
    }

    try {
      await gatheringService.deleteGathering(gatheringId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Gathering not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to delete gathering',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getAllGatherings,
    getGatheringsByEventId,
    createGathering,
    deleteGathering,
  };
}
