import { Context } from 'hono';
import { z } from 'zod';
import type { UpdateGatheringSpotRequestDTO } from '../../application/dto/UpdateGatheringSpotRequestDTO';
import { IGatheringSpotService } from '../../application/services/IGatheringSpotService';

const createGatheringSpotSchema = z.object({
  gatheringSpotName: z.string().trim().min(1),
});
const gatheringSpotIdSchema = z.coerce.number().int().positive();

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

  const updateGatheringSpot = async (c: Context) => {
    const parsedId = gatheringSpotIdSchema.safeParse(
      c.req.param('gatheringSpotId')
    );
    if (!parsedId.success) {
      return c.json({ error: 'Invalid gathering spot ID' }, 400);
    }

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

    const request: UpdateGatheringSpotRequestDTO = parsedBody.data;
    try {
      const gatheringSpot = await gatheringSpotService.updateGatheringSpot(
        parsedId.data,
        { gathering_spot_name: request.gatheringSpotName }
      );
      return c.json(gatheringSpot);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering spot not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to update gathering spot',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { getAllGatheringSpots, createGatheringSpot, updateGatheringSpot };
}
