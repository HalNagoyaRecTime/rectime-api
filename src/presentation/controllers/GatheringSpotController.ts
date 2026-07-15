import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringSpotService } from '../../application/services/IGatheringSpotService';

const createGatheringSpotSchema = z.object({
  gatheringSpotName: z.string().trim().min(1),
});

export function createGatheringSpotController(
  gatheringSpotService: IGatheringSpotService
) {
  const getAllGatheringSpots = async (c: Context) => {
    try {
      return c.json(await gatheringSpotService.getAllGatheringSpots());
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch gathering spots',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const createGatheringSpot = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringSpotSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid gathering spot request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const gatheringSpot = await gatheringSpotService.createGatheringSpot(
        parsedBody.data.gatheringSpotName
      );
      return c.json(gatheringSpot, 201);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to create gathering spot',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { getAllGatheringSpots, createGatheringSpot };
}
