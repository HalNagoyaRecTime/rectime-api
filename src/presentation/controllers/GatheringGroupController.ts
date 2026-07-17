import { Context } from 'hono';
import { IGatheringGroupService } from '../../application/services/IGatheringGroupService';
import {
  createGatheringGroupSchema,
  type GatheringGroupListResponseDTO,
  type GatheringGroupResponseDTO,
} from '../openapi/gatherings';

export function createGatheringGroupController(
  gatheringGroupService: IGatheringGroupService
) {
  const getAllGatheringGroups = async (c: Context) => {
    try {
      const gatheringGroups: GatheringGroupListResponseDTO =
        await gatheringGroupService.getAllGatheringGroups();
      return c.json(gatheringGroups, 200);
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
      const gatheringGroup: GatheringGroupResponseDTO =
        await gatheringGroupService.createGatheringGroup(
          parsedBody.data.gatheringGroupName
        );
      return c.json(gatheringGroup, 201);
    } catch (error) {
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
