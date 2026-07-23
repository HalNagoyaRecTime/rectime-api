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

  const deleteGatheringGroup = async (c: Context) => {
    const gatheringGroupId = Number(c.req.param('gatheringGroupId'));
    if (!Number.isInteger(gatheringGroupId) || gatheringGroupId <= 0) {
      return c.json({ error: 'Invalid gathering group ID' }, 400);
    }

    try {
      await gatheringGroupService.deleteGatheringGroup(gatheringGroupId);
      return c.body(null, 204);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering group not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        [
          'Gathering group is assigned to an event',
          'Gathering group is in use by notification schedules',
        ].includes(error.message)
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to delete gathering group',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getAllGatheringGroups,
    createGatheringGroup,
    deleteGatheringGroup,
  };
}
