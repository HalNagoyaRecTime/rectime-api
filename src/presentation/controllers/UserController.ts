import type { Context } from 'hono';
import { z } from 'zod';
import type { IUserService } from '../../application/services/IUserService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

const userIdSchema = z.coerce.number().int().positive();
const updateUserStatusSchema = z
  .object({
    is_live_active: z.boolean(),
  })
  .strict();

// 無効化を断る理由。いずれも再有効化する手段が失われるため400で返す。
const DEACTIVATION_REJECTED_ERRORS = {
  'Cannot deactivate yourself': UserErrors.CANNOT_DEACTIVATE_SELF,
  'Cannot deactivate the last active staff':
    UserErrors.CANNOT_DEACTIVATE_LAST_STAFF,
} as const;

type UserContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

// OpenAPIルートのハンドラは、応答をステータスごとの型として推論できる必要がある。
// そのため以下のヘルパーには戻り値の型を注釈しない（Response と書くと型が合わなくなる）。
export function createUserController(service: IUserService) {
  // staff権限の判定はルート側のrequireStaffが済ませている。ここでは
  // 自分自身の無効化を断るために、操作した本人のuserIdを取り出すだけ。
  const operatorUserId = (c: UserContext) => {
    const userId = c.get('authenticatedUserId');
    return userId === null
      ? errorResponse(c, CommonErrors.UNAUTHORIZED)
      : userId;
  };

  const updateUserStatus = async (c: UserContext) => {
    const operator = operatorUserId(c);
    if (operator instanceof Response) return operator;

    const targetUserId = parseUserId(c);
    if (targetUserId instanceof Response) return targetUserId;

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateUserStatusSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_USER_STATUS_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const updated = await service.updateUserStatus({
        operator_user_id: operator,
        user_id: targetUserId,
        is_live_active: parsedBody.data.is_live_active,
      });
      return c.json(updated, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return errorResponse(c, UserErrors.USER_NOT_FOUND);
      }
      const rejected =
        error instanceof Error
          ? DEACTIVATION_REJECTED_ERRORS[
              error.message as keyof typeof DEACTIVATION_REJECTED_ERRORS
            ]
          : undefined;
      if (rejected) {
        return errorResponse(c, rejected);
      }
      // 想定外の失敗はDB由来の例外が多く、文面にテーブル名や制約名が含まれる。
      // 調査に必要な情報はログへ出し、応答には失敗した事実だけを返す。
      console.error('Failed to update user status', error);
      return errorResponse(c, UserErrors.USER_STATUS_UPDATE_FAILED);
    }
  };

  return {
    updateUserStatus,
  };
}

function parseUserId(c: UserContext) {
  const parsedId = userIdSchema.safeParse(c.req.param('userId'));
  return parsedId.success
    ? parsedId.data
    : errorResponse(c, UserErrors.INVALID_USER_ID);
}
