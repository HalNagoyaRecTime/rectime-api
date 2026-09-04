import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from './diContainer';
import type { AuthenticationVariables } from './bearerAuthentication';
import type { AuthVariables } from './requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';

// requireAuth の後段でのみ利用する。認証済みユーザーのuser_idを使って
// staff権限をリクエストごとにDBから判定する(JWTにはstaff権限を持たせない)。
export const requireStaff = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables & AuthVariables;
}>(async (c, next) => {
  const userId = c.get('authenticatedUserId');
  if (userId === null) {
    return errorResponse(c, CommonErrors.UNAUTHORIZED);
  }

  let isStaff: boolean;
  try {
    isStaff = await c.get('container').authorizationService.isStaff(userId);
  } catch {
    return errorResponse(c, {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'staff権限の確認に失敗しました',
    });
  }

  if (!isStaff) {
    return errorResponse(c, CommonErrors.STAFF_REQUIRED);
  }

  await next();
});
