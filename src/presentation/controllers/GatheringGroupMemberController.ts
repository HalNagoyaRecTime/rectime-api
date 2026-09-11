import { Context } from 'hono';
import { z } from 'zod';
import { IGatheringGroupMemberService } from '../../application/services/IGatheringGroupMemberService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { UserErrors } from '../errors/userErrors';

const addGatheringMemberSchema = z.object({
  userId: z.number().int().positive(),
});

const replaceGatheringMembersSchema = z.object({
  user_ids: z
    .array(z.number().int().positive())
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'user_idsに重複があります',
    }),
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
      return errorResponse(c, EventErrors.INVALID_GATHERING_ID);
    }

    try {
      return c.json(
        await gatheringGroupMemberService.getGatheringMembers(gatheringId),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Gathering not found') {
        return errorResponse(c, EventErrors.GATHERING_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_MEMBER_LIST_FAILED);
    }
  };

  const addGatheringMember = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    if (gatheringId === null) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_ID);
    }
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = addGatheringMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_MEMBER_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const member = await gatheringGroupMemberService.addGatheringMember(
        gatheringId,
        parsedBody.data.userId
      );
      return c.json(member, 201);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Gathering member already exists') {
          return errorResponse(c, EventErrors.GATHERING_MEMBER_ALREADY_EXISTS);
        }
        if (error.message === 'Gathering not found') {
          return errorResponse(c, EventErrors.GATHERING_NOT_FOUND);
        }
        if (error.message === 'User not found') {
          return errorResponse(c, UserErrors.USER_NOT_FOUND);
        }
      }
      return errorResponse(c, EventErrors.GATHERING_MEMBER_ADD_FAILED);
    }
  };

  const removeGatheringMember = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    const userId = Number(c.req.param('userId'));
    if (gatheringId === null || !Number.isInteger(userId) || userId <= 0) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_MEMBER_ID);
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
        error.message === 'Gathering member not found'
      ) {
        return errorResponse(c, EventErrors.GATHERING_MEMBER_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.GATHERING_MEMBER_REMOVE_FAILED);
    }
  };

  const replaceGatheringMembers = async (c: Context) => {
    const gatheringId = getGatheringId(c);
    if (gatheringId === null) {
      return errorResponse(c, EventErrors.INVALID_GATHERING_ID);
    }
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = replaceGatheringMembersSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_GATHERING_MEMBER_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const result = await gatheringGroupMemberService.replaceGatheringMembers(
        gatheringId,
        parsedBody.data.user_ids
      );
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Gathering not found') {
          return errorResponse(c, EventErrors.GATHERING_NOT_FOUND);
        }
        if (error.message === 'User not found') {
          return errorResponse(c, UserErrors.USER_NOT_FOUND);
        }
      }
      return errorResponse(c, EventErrors.GATHERING_MEMBER_UPDATE_FAILED);
    }
  };

  return {
    getGatheringMembers,
    addGatheringMember,
    removeGatheringMember,
    replaceGatheringMembers,
  };
}
