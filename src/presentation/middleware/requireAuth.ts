import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import type { AuthUser } from '../../domain/auth/types';
import type { AppContext } from '../auth/helpers';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import type { AuthenticationVariables } from './bearerAuthentication';

export type { AuthUser };

export type AuthVariables = {
  authUser: AuthUser;
};

// apiV1.use('*', ...) にはしていない: 将来 /auth ルート（ログイン自体）が
// このHonoインスタンスにマウントされた際、ログイン前のリクエストまで
// ブロックしてしまわないよう、認証が必要なルートにのみ個別に付与する。
//
// トークン検証自体は bearerAuthenticationMiddleware（apiV1.use('*', ...)）が
// 既に1回行っている。ここでは二重に検証せず、その結果（verifiedAuthUser）を
// 読んで未認証なら401を返すだけのゲートとする。
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthenticationVariables & AuthVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const authUser = c.get('verifiedAuthUser');

  if (!authUser) {
    return errorResponse(appContext, CommonErrors.UNAUTHORIZED);
  }

  c.set('authUser', authUser);
  await next();
});
