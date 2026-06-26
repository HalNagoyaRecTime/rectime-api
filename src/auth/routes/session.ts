import { Hono } from 'hono';
import type { Env as Bindings } from '../../lib/env';
import { verifyMobileJwt, signMobileJwt, type MobileJwtClaims } from '../jwt';
import {
  getSession,
  deleteSession,
  getSessionIdFromCookie,
  buildSessionCookie,
  clearSessionCookie,
} from '../session';
import {
  errorResponse,
  getClientType,
  getNumberEnv,
  shouldUseSecureCookie,
  getBearerToken,
  saveSession,
  refreshMicrosoftAccessToken,
} from '../helpers';
import { type MobileRefreshEntry, ACCOUNT_PHOTO_PATH } from '../types';

const sessionRouter = new Hono<{ Bindings: Bindings }>();

sessionRouter.post('/logout', async c => {
  const clientType = getClientType(c);
  if (!clientType) {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
  }

  if (clientType === 'mobile') {
    const token = getBearerToken(c);
    if (!token) {
      return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
    }

    let claims: MobileJwtClaims;
    try {
      claims = await verifyMobileJwt(token, c.env.JWT_SECRET);
    } catch {
      return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
    }

    const body = (await c.req.json().catch(() => null)) as {
      refresh_token_id?: unknown;
    } | null;
    if (
      body &&
      typeof body.refresh_token_id === 'string' &&
      body.refresh_token_id.length > 0
    ) {
      await c.env.AUTH_KV.delete(`mobile_refresh:${body.refresh_token_id}`);
    }
    await c.env.AUTH_KV.delete(`mobile_refresh_by_user:${claims.sub}`);

    return c.json({ message: 'Logged out successfully' });
  }

  const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
  if (sessionId) {
    await deleteSession(c.env.AUTH_KV, sessionId);
  }

  const postLogoutRedirectUri = `${c.env.FRONTEND_URL}/login`;
  const msLogoutUrl = `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;

  return new Response(
    JSON.stringify({ message: 'Logged out successfully', ms_logout_url: msLogoutUrl }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(shouldUseSecureCookie(c)),
      },
    }
  );
});

sessionRouter.post('/refresh', async c => {
  const clientType = getClientType(c);
  if (!clientType) {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
  }

  if (clientType === 'web') {
    const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
    if (!sessionId) {
      return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
    }

    const session = await getSession(c.env.AUTH_KV, sessionId);
    if (!session?.ms_refresh_token) {
      return errorResponse(
        c,
        401,
        'SESSION_EXPIRED',
        'セッションの有効期限が切れました。'
      );
    }

    const tokens = await refreshMicrosoftAccessToken(
      c,
      session.ms_refresh_token
    );
    if (!tokens?.refresh_token) {
      return errorResponse(
        c,
        401,
        'REFRESH_TOKEN_EXPIRED',
        '再ログインが必要です。'
      );
    }

    const ttl = getNumberEnv(c.env.SESSION_EXPIRES_SEC, 86400);
    await saveSession(c, sessionId, {
      ...session,
      ms_refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    });

    return new Response(JSON.stringify({ message: 'Session refreshed' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildSessionCookie(
          sessionId,
          ttl,
          shouldUseSecureCookie(c)
        ),
      },
    });
  }

  const body = (await c.req.json().catch(() => null)) as {
    refresh_token_id?: unknown;
  } | null;
  if (
    !body ||
    typeof body.refresh_token_id !== 'string' ||
    body.refresh_token_id.length === 0
  ) {
    return errorResponse(
      c,
      400,
      'INVALID_REQUEST',
      'refresh_token_id が必要です。'
    );
  }

  const refreshKey = `mobile_refresh:${body.refresh_token_id}`;
  const refreshRaw = await c.env.AUTH_KV.get(refreshKey);
  if (!refreshRaw) {
    return errorResponse(
      c,
      401,
      'SESSION_EXPIRED',
      'セッションの有効期限が切れました。'
    );
  }

  const refresh = JSON.parse(refreshRaw) as MobileRefreshEntry;
  const tokens = await refreshMicrosoftAccessToken(
    c,
    refresh.ms_refresh_token,
    { includeClientAssertion: false }
  );
  if (!tokens?.refresh_token) {
    return errorResponse(
      c,
      401,
      'REFRESH_TOKEN_EXPIRED',
      '再ログインが必要です。'
    );
  }

  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
  const nextRefreshTokenId = crypto.randomUUID();
  await c.env.AUTH_KV.put(
    `mobile_refresh:${nextRefreshTokenId}`,
    JSON.stringify({
      ...refresh,
      ms_refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    } satisfies MobileRefreshEntry),
    { expirationTtl: refreshTtl }
  );
  await c.env.AUTH_KV.put(
    `mobile_refresh_by_user:${refresh.user_id}`,
    nextRefreshTokenId,
    { expirationTtl: refreshTtl }
  );
  await c.env.AUTH_KV.delete(refreshKey);

  const jwtTtl = getNumberEnv(c.env.JWT_EXPIRES_SEC, 3600);
  const accessToken = await signMobileJwt(
    {
      sub: refresh.user_id,
      oid: refresh.oid,
      email: refresh.email,
      display_name: refresh.display_name,
      avatar_url: refresh.avatar_url ?? ACCOUNT_PHOTO_PATH,
      avatar_updated_at: refresh.avatar_updated_at ?? null,
      client_type: 'mobile',
    },
    c.env.JWT_SECRET,
    jwtTtl
  );

  return c.json({
    access_token: accessToken,
    refresh_token_id: nextRefreshTokenId,
    token_type: 'Bearer',
    expires_in: jwtTtl,
  });
});

export { sessionRouter };
