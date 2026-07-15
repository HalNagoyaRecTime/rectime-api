import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringService } from '../../application/services/IGatheringService';

const createGatheringSchema = z.object({
  gatheringGroupId: z.number().int().positive(),
  eventId: z.number().int().positive(),
  gatheringSpotId: z.number().int().positive(),
  // HH:MM形式。99:59は集合時刻が未設定であることを表す。
  gatheringTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^99:59$/)
    .optional(),
  round: z.number().int().min(1).max(99).optional(),
});

export function createGatheringController(gatheringService: IGatheringService) {
  const getAllGatherings = async (c: Context) => {
    try {
      return c.json(await gatheringService.getAllGatherings());
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
        gathering_group_id: parsedBody.data.gatheringGroupId,
        event_id: parsedBody.data.eventId,
        gathering_spot_id: parsedBody.data.gatheringSpotId,
        gathering_time: parsedBody.data.gatheringTime,
        round: parsedBody.data.round,
      });
      return c.json(gathering, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Gathering group not found',
          'Event not found',
          'Gathering spot not found',
        ].includes(error.message)
      ) {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Gathering already exists for this group'
      ) {
        return c.json({ error: error.message }, 409);
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

  return { getAllGatherings, createGathering };
}
