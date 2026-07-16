import { Context } from 'hono';
import { IGatheringGroupMemberService } from '../../application/services/IGatheringGroupMemberService';
import {
  addGatheringGroupMemberSchema,
  gatheringGroupIdParams,
  gatheringGroupMemberParams,
} from '../openapi';

function getGatheringGroupId(c: Context): number | null {
  const parsedParams = gatheringGroupIdParams.safeParse({
    gatheringGroupId: c.req.param('gatheringGroupId'),
  });
  return parsedParams.success
    ? Number(parsedParams.data.gatheringGroupId)
    : null;
}

export function createGatheringGroupMemberController(
  gatheringGroupMemberService: IGatheringGroupMemberService
) {
  const getGatheringGroupMembers = async (c: Context) => {
    const gatheringGroupId = getGatheringGroupId(c);
    if (gatheringGroupId === null) {
      return c.json({ error: 'Invalid gathering group ID' }, 400);
    }

    try {
      return c.json(
        await gatheringGroupMemberService.getGatheringGroupMembers(
          gatheringGroupId
        ),
        200
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Gathering group not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch gathering group members',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const addGatheringGroupMember = async (c: Context) => {
    const gatheringGroupId = getGatheringGroupId(c);
    if (gatheringGroupId === null) {
      return c.json({ error: 'Invalid gathering group ID' }, 400);
    }
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = addGatheringGroupMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid gathering group member request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const member = await gatheringGroupMemberService.addGatheringGroupMember(
        gatheringGroupId,
        parsedBody.data.userId
      );
      return c.json(member, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Gathering group member already exists',
          'Gathering group not found',
          'User not found',
        ].includes(error.message)
      ) {
        return c.json(
          { error: error.message },
          error.message === 'Gathering group member already exists' ? 409 : 404
        );
      }
      return c.json(
        {
          error: 'Failed to add gathering group member',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const removeGatheringGroupMember = async (c: Context) => {
    const parsedParams = gatheringGroupMemberParams.safeParse({
      gatheringGroupId: c.req.param('gatheringGroupId'),
      userId: c.req.param('userId'),
    });
    if (!parsedParams.success) {
      return c.json({ error: 'Invalid gathering group member ID' }, 400);
    }
    const gatheringGroupId = Number(parsedParams.data.gatheringGroupId);
    const userId = Number(parsedParams.data.userId);

    try {
      await gatheringGroupMemberService.removeGatheringGroupMember(
        gatheringGroupId,
        userId
      );
      return c.body(null, 204);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Gathering group member not found',
          'Gathering group not found',
          'User not found',
        ].includes(error.message)
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to remove gathering group member',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getGatheringGroupMembers,
    addGatheringGroupMember,
    removeGatheringGroupMember,
  };
}
