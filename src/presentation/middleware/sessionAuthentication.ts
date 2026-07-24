import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from './diContainer';

export type AuthenticationVariables = {
  authenticatedUserId: number | null;
};

export const sessionAuthenticationMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>(async (c, next) => {
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
