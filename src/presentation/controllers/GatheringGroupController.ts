import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringGroupService } from '../../application/services/IGatheringGroupService';

const createGatheringGroupSchema = z.object({
  userId: z.number().int().positive(),
});

export function createGatheringGroupController(
  gatheringGroupService: IGatheringGroupService
) {
  const getAllGatheringGroups = async (c: Context) => {
    try {
      return c.json(await gatheringGroupService.getAllGatheringGroups());
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch gathering groups',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const createGatheringGroup = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createGatheringGroupSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid gathering group request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const gatheringGroup = await gatheringGroupService.createGatheringGroup(
        parsedBody.data.userId
      );
      return c.json(gatheringGroup, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'User already owns a gathering group'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to create gathering group',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { getAllGatheringGroups, createGatheringGroup };
}
