import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from './diContainer';
import type { AuthenticationVariables } from './bearerAuthentication';
import type { AuthVariables } from './requireAuth';

// requireAuth の後段でのみ利用する。認証済みユーザーのuser_idを使って
// staff権限をリクエストごとにDBから判定する(JWTにはstaff権限を持たせない)。
//
// 403のエラー形式は errorResponse() と同じ { error: { code, message } } の
// 形にしているが、errorResponse() 自体は400/401/404/409/500のみを受け付けており
// 403は未対応のため、ここでは直接組み立てている。errorResponse() が403に
// 対応し次第、そちらへ差し替える。
export const requireStaff = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables & AuthVariables;
}>(async (c, next) => {
  const userId = c.get('authenticatedUserId');
  if (userId === null) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: '認証が必要です' } },
      401
    );
  }

  let isStaff: boolean;
  try {
    isStaff = await c.get('container').authorizationService.isStaff(userId);
  } catch {
    return c.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'staff権限の確認に失敗しました',
        },
      },
      500
    );
  }

  if (!isStaff) {
    return c.json(
      { error: { code: 'STAFF_REQUIRED', message: 'staff権限が必要です' } },
      403
    );
  }

  await next();
});
