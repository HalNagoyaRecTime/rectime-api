import type { Context, Next } from 'hono';
import type { Bindings } from '../types/bindings';
import { getSession, getSessionIdFromCookie } from './session';

export async function authMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next,
): Promise<Response | void> {
  const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);

  if (!sessionId) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '認証が必要です。' } }, 401);
  }

  const session = await getSession(c.env.AUTH_KV, sessionId);

  if (!session) {
    return c.json({ error: { code: 'SESSION_EXPIRED', message: 'セッションの有効期限が切れました。再ログインしてください。' } }, 401);
  }

  await next();
}
