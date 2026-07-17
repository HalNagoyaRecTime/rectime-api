import { Context } from 'hono';
import { IGatheringService } from '../../application/services/IGatheringService';
import {
  createGatheringSchema,
  type GatheringListResponseDTO,
  type GatheringResponseDTO,
} from '../openapi/gatherings';

export function createGatheringController(gatheringService: IGatheringService) {
  const getAllGatherings = async (c: Context) => {
    try {
      const gatherings: GatheringListResponseDTO =
        await gatheringService.getAllGatherings();
      return c.json(gatherings, 200);
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
      const gathering: GatheringResponseDTO =
        await gatheringService.createGathering({
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
