import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringGroupMemberService } from '../../application/services/IGatheringGroupMemberService';

const addGatheringMemberSchema = z.object({
  userId: z.number().int().positive(),
});

function getGatheringId(c: Context): number | null {
  const id = Number(c.req.param('gatheringId'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function createGatheringGroupMemberController(
  gatheringGroupMemberService: IGatheringGroupMemberService
) {
  const getGatheringMembers = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    if (gatheringId === null) {
      return c.json({ error: 'Invalid gathering ID' }, 400);
    }

    try {
      return c.json(
        await gatheringGroupMemberService.getGatheringMembers(gatheringId)
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Gathering not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch gathering members',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const addGatheringMember = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    if (gatheringId === null) {
      return c.json({ error: 'Invalid gathering ID' }, 400);
    }
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = addGatheringMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid gathering member request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const member = await gatheringGroupMemberService.addGatheringMember(
        gatheringId,
        parsedBody.data.userId
      );
      return c.json(member, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Gathering member already exists',
          'Gathering not found',
          'User not found',
        ].includes(error.message)
      ) {
        return c.json(
          { error: error.message },
          error.message === 'Gathering member already exists' ? 409 : 404
        );
      }
      return c.json(
        {
          error: 'Failed to add gathering member',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const removeGatheringMember = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    const userId = Number(c.req.param('userId'));
    if (gatheringId === null || !Number.isInteger(userId) || userId <= 0) {
      return c.json({ error: 'Invalid gathering member ID' }, 400);
    }

    try {
      await gatheringGroupMemberService.removeGatheringMember(
        gatheringId,
        userId
      );
      return c.body(null, 204);
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'Gathering member not found',
          'Gathering not found',
          'User not found',
        ].includes(error.message)
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to remove gathering member',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getGatheringMembers,
    addGatheringMember,
    removeGatheringMember,
  };
}
