import { Context } from 'hono';
import { IGatheringGroupMemberService } from '../../application/services/IGatheringGroupMemberService';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { UserErrors } from '../errors/userErrors';
import { replaceGatheringMembersSchema } from '../openapi/gatherings';

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
    replaceGatheringMembers,
  };
}
