import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { verifyMobileJwt } from '../../infrastructure/auth/jwt';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from './diContainer';

export type AuthenticationVariables = {
  authenticatedUserId: number | null;
};

export const sessionAuthenticationMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>(async (c, next) => {
  const authorization = c.req.header('Authorization');
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (bearerMatch) {
    try {
      const claims = await verifyMobileJwt(bearerMatch[1], c.env.JWT_SECRET);
      const userId = Number(claims.sub);
      c.set(
        'authenticatedUserId',
        Number.isInteger(userId) && userId > 0 ? userId : null
      );
    } catch {
      c.set('authenticatedUserId', null);
    }
    await next();
    return;
  }

  const sessionId = getCookie(c, 'session');
  const session = sessionId
    ? await c.get('container').authService.getSession(sessionId)
    : null;
  const userId = Number(session?.user_id);

  c.set(
    'authenticatedUserId',
    session && Number.isInteger(userId) && userId > 0 ? userId : null
  );
  await next();
});
