import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
  getBearerToken,
  getClientType,
  type AppContext,
} from '../auth/helpers';
import { verifyAccessToken } from '../../infrastructure/auth/jwt';
import type { ContainerVariables } from './diContainer';

export type AuthenticationVariables = {
  authenticatedUserId: number | null;
};

// requireAuthとは独立して、認証済みなら authenticatedUserId を
// (非強制で)Contextへ設定する。requireAuthが付いていないルートでも
// コントローラー側で権限チェックに使えるようにするためのもの。
export const bearerAuthenticationMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const clientType = getClientType(appContext);
  const token = clientType ? getBearerToken(appContext) : null;

  let authenticatedUserId: number | null = null;
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
    } catch {
      authenticatedUserId = null;
    }
  }

  c.set('authenticatedUserId', authenticatedUserId);
  await next();
});
