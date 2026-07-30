import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import { ACCOUNT_PHOTO_PATH } from '../../../domain/auth/types';
import type { IdTokenClaims } from '../../../infrastructure/auth/verifyIdToken';
import { createSession, buildSessionCookie } from '../../../infrastructure/auth/session';
import {
  errorResponse,
  getNumberEnv,
  shouldUseSecureCookie,
  upsertUser,
} from '../helpers';

const devLogin = new Hono<{ Bindings: Bindings }>();

// Local-only bypass for the Microsoft OAuth flow so the app can be exercised
// without a real Entra ID app registration. Reuses the same upsertUser /
// createSession path as the real callback, just skipping token verification.
// Inert everywhere except NODE_ENV=development (wrangler.jsonc only sets that
// for the local "default"/"development" envs; deployed envs are "production").
devLogin.get('/dev-login', async c => {
  if (c.env.NODE_ENV !== 'development') {
    return errorResponse(c, 404, 'NOT_FOUND', 'Not found');
  }

  const oid = c.req.query('oid') ?? 'dev-bypass-oid';
  const email = c.req.query('email') ?? 'dev-bypass@localhost.test';
  const name = c.req.query('name') ?? 'ローカル開発ユーザー';
  const now = Math.floor(Date.now() / 1000);

  const claims: IdTokenClaims = {
    sub: oid,
    oid,
    tid: 'dev-bypass-tenant',
    email,
    name,
    nonce: 'dev-bypass',
    iss: 'dev-bypass',
    aud: 'dev-bypass',
    exp: now + 3600,
    iat: now,
  };

  const user = await upsertUser(c, claims);
  const ttl = getNumberEnv(c.env.SESSION_EXPIRES_SEC, 86400);
  const sessionId = await createSession(
    c.env.AUTH_KV,
    {
      user_id: user.id,
      oid: user.oid,
      tid: user.tid,
      sub: user.sub,
      email: user.email,
      display_name: user.display_name,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: null,
    },
    ttl
  );

  const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173';

  return new Response(
    `<!doctype html><meta charset="utf-8"><p>開発用ログインが完了しました。<a href="${frontendUrl}">recwatch に戻る</a></p>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': buildSessionCookie(
          sessionId,
          ttl,
          shouldUseSecureCookie(c)
        ),
      },
    }
  );
});

export { devLogin };
