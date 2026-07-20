import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
  errorResponse,
  getBearerToken,
  getClientType,
  type AppContext,
} from '../auth/helpers';
import {
  getSession,
  getSessionIdFromCookie,
} from '../../infrastructure/auth/session';
import { verifyMobileJwt } from '../../infrastructure/auth/jwt';

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
};

export type AuthVariables = {
  authUser: AuthUser;
};

// apiV1.use('*', ...) にはしていない: 将来 /auth ルート（ログイン自体）が
// このHonoインスタンスにマウントされた際、ログイン前のリクエストまで
// ブロックしてしまわないよう、認証が必要なルートにのみ個別に付与する。
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const clientType = getClientType(appContext);

  if (clientType === 'mobile') {
    const token = getBearerToken(appContext);
    if (!token) {
      return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
    }

    let claims;
    try {
      claims = await verifyMobileJwt(token, c.env.JWT_SECRET);
    } catch {
      return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
    }

    c.set('authUser', {
      id: claims.sub,
      email: claims.email,
      display_name: claims.display_name,
    });
    await next();
    return;
  }

  if (clientType !== 'web') {
    return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
  }

  const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
  if (!sessionId) {
    return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
  }

  const session = await getSession(c.env.AUTH_KV, sessionId);
  if (!session) {
    return errorResponse(appContext, 401, 'UNAUTHORIZED', '認証が必要です');
  }

  c.set('authUser', {
    id: session.user_id,
    email: session.email,
    display_name: session.display_name,
  });
  await next();
});
