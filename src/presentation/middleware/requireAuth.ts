import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
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

function unauthorized(c: Context): Response {
  return c.json(
    { error: { code: 'UNAUTHORIZED', message: '認証が必要です' } },
    401
  );
}

// Web はセッションCookie、Mobile は Authorization: Bearer <JWT> で認証する
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const clientType = getClientType(appContext);

  if (clientType === 'mobile') {
    const token = getBearerToken(appContext);
    if (!token) {
      return unauthorized(c);
    }

    try {
      const claims = await verifyMobileJwt(token, c.env.JWT_SECRET);
      c.set('authUser', {
        id: claims.sub,
        email: claims.email,
        display_name: claims.display_name,
      });
      await next();
      return;
    } catch {
      return unauthorized(c);
    }
  }

  if (clientType !== 'web') {
    return unauthorized(c);
  }

  const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
  if (!sessionId) {
    return unauthorized(c);
  }

  const session = await getSession(c.env.AUTH_KV, sessionId);
  if (!session) {
    return unauthorized(c);
  }

  c.set('authUser', {
    id: session.user_id,
    email: session.email,
    display_name: session.display_name,
  });
  await next();
});
