import { Context } from 'hono';
import { IGatheringGroupService } from '../../application/services/IGatheringGroupService';

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
    try {
      const gatheringGroup = await gatheringGroupService.createGatheringGroup();
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
