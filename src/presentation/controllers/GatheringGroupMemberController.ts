import { Context } from 'hono';
import { z } from 'zod';
import type { AddGatheringGroupMemberRequestDTO } from '../../application/dto/GatheringGroupMemberDTO';
import { IGatheringGroupMemberService } from '../../application/services/IGatheringGroupMemberService';

const addGatheringGroupMemberSchema = z.object({
  userId: z.number().int().positive(),
});

function getGatheringGroupId(c: Context): number | null {
  const id = Number(c.req.param('gatheringGroupId'));
  return Number.isInteger(id) && id > 0 ? id : null;
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
        )
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
        parsedBody.data satisfies AddGatheringGroupMemberRequestDTO
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
    const gatheringGroupId = getGatheringGroupId(c);
    const userId = Number(c.req.param('userId'));
    if (gatheringGroupId === null || !Number.isInteger(userId) || userId <= 0) {
      return c.json({ error: 'Invalid gathering group member ID' }, 400);
    }

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
