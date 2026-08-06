import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
  getBearerToken,
  getClientType,
  type AppContext,
} from '../auth/helpers';
import { verifyAccessToken } from '../../infrastructure/auth/jwt';
import type { ContainerVariables } from './diContainer';
import type { AuthUser } from '../../domain/auth/types';

export type AuthenticationVariables = {
  authenticatedUserId: number | null;
  verifiedAuthUser: AuthUser | null;
};

// requireAuthとは独立して、認証済みなら authenticatedUserId / verifiedAuthUser を
// (非強制で)Contextへ設定する。requireAuthが付いていないルートでも
// コントローラー側で権限チェックに使えるようにするためのもの。
//
// トークン検証はここで1回だけ行う。requireAuth（apiV1.use('*', ...)の後段で
// 各ルートに個別付与）はこの verifiedAuthUser をそのまま読むだけにして、
// 同じトークンに対して verifyAccessToken を二重に呼び出さないようにしている。
export const bearerAuthenticationMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const clientType = getClientType(appContext);
  const token = clientType ? getBearerToken(appContext) : null;

  let authenticatedUserId: number | null = null;
  let verifiedAuthUser: AuthUser | null = null;
  if (clientType && token) {
    try {
      const claims = await verifyAccessToken(
        token,
        c.env.JWT_SECRET,
        clientType
      );
      const userId = Number(claims.sub);
      if (Number.isInteger(userId) && userId > 0) {
        authenticatedUserId = userId;
      }
      verifiedAuthUser = {
        id: claims.sub,
        email: claims.email,
        display_name: claims.display_name,
      };
    } catch {
      authenticatedUserId = null;
      verifiedAuthUser = null;
    }
  }

  c.set('authenticatedUserId', authenticatedUserId);
  c.set('verifiedAuthUser', verifiedAuthUser);
  await next();
});
