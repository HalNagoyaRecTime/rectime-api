import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
  errorResponse,
  rejectInactiveUser,
  type AppContext,
} from '../auth/helpers';
import type { AuthUser } from '../../domain/auth/types';
import type { AuthenticationVariables } from './bearerAuthentication';
import type { ContainerVariables } from './diContainer';

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
//
// あわせて users.is_live_active も確認する（#255）。JWTは発行時点の情報しか
// 持たないため、発行後に管理者がユーザーを無効化しても、トークンの有効期限が
// 切れるまでは通ってしまう。無効化を即座にアクセス遮断へ反映させるには、
// リクエストごとに現在の状態をDBで確認するしかない。
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables & AuthVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const authUser = c.get('verifiedAuthUser');
  const userId = c.get('authenticatedUserId');

  // userIdがnullになるのは、トークンは正しいがsubがユーザーIDとして
  // 解釈できない場合。状態を確認できない以上は通さない（フェイルクローズ）。
  if (!authUser || userId === null) {
    return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
  }

  const rejected = await rejectInactiveUser(appContext, userId);
  if (rejected) return rejected;

  c.set('authUser', authUser);
  await next();
});
