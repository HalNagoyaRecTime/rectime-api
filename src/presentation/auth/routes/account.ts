import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import {
  signMobileJwt,
  verifyMobileJwt,
  type MobileJwtClaims,
} from '../../../infrastructure/auth/jwt';
import {
  getSession,
  deleteSession,
  getSessionIdFromCookie,
  buildSessionCookie,
  clearSessionCookie,
  type Session,
} from '../../../infrastructure/auth/session';
import {
  errorResponse,
  getClientType,
  getNumberEnv,
  shouldUseSecureCookie,
  getBearerToken,
  refreshMicrosoftAccessToken,
  saveSession,
  userResponse,
  getUserCategories,
} from '../helpers';
import {
  type MobileRefreshEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import { GRAPH_ME_PHOTO_URL } from '../../../infrastructure/auth/microsoftClient';

const account = new Hono<{ Bindings: Bindings }>();

// GET /auth/me
account.get('/me', async c => {
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

    try {
      const claims = await verifyMobileJwt(token, c.env.JWT_SECRET);
      const categories = await getUserCategories(c, claims.sub);
      return c.json({
        user: userResponse(
          {
            id: claims.sub,
            email: claims.email,
            display_name: claims.display_name,
            avatar_url: claims.avatar_url ?? ACCOUNT_PHOTO_PATH,
            avatar_updated_at: claims.avatar_updated_at ?? null,
          },
          categories
        ),
      });
    } catch (error) {
      const code =
        error instanceof Error && error.message === 'SESSION_EXPIRED'
          ? 'SESSION_EXPIRED'
          : 'INVALID_TOKEN';
      const message =
        code === 'SESSION_EXPIRED'
          ? 'セッションの有効期限が切れました。'
          : 'トークンが不正です。';
      return errorResponse(c, 401, code, message);
    }
  }

  const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
  if (!sessionId) {
    return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
  }

  const session = await getSession(c.env.AUTH_KV, sessionId);
  if (!session) {
    return errorResponse(
      c,
      401,
      'SESSION_EXPIRED',
      'セッションの有効期限が切れました。'
    );
  }

  const categories = await getUserCategories(c, session.user_id);
  return c.json({
    user: userResponse(
      {
        id: session.user_id,
        email: session.email,
        display_name: session.display_name,
        avatar_url: session.avatar_url ?? ACCOUNT_PHOTO_PATH,
        avatar_updated_at: session.avatar_updated_at ?? null,
      },
      categories
    ),
  });
});

// GET /auth/me/photo
account.get('/me/photo', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'web' && clientType !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      '不正なクライアント種別です。'
    );
  }

  let msRefreshToken: string | null = null;
  let sessionId: string | null = null;
  let refreshTokenId: string | null = null;
  let sessionOrRefresh: Session | MobileRefreshEntry | null = null;

  if (clientType === 'web') {
    sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
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
    msRefreshToken = session.ms_refresh_token;
    sessionOrRefresh = session;
  } else {
    const token = getBearerToken(c);
    if (!token) {
      return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
    }

    let claims: MobileJwtClaims;
    try {
      claims = await verifyMobileJwt(token, c.env.JWT_SECRET);
    } catch {
      return errorResponse(c, 401, 'UNAUTHORIZED', '認証が不正です。');
    }

    refreshTokenId = await c.env.AUTH_KV.get(
      `mobile_refresh_by_user:${claims.sub}`
    );
    if (!refreshTokenId) {
      return errorResponse(
        c,
        401,
        'SESSION_EXPIRED',
        'セッションが見つかりません。'
      );
    }

    const refreshRaw = await c.env.AUTH_KV.get(
      `mobile_refresh:${refreshTokenId}`
    );
    if (!refreshRaw) {
      return errorResponse(
        c,
        401,
        'SESSION_EXPIRED',
        'セッションの有効期限が切れました。'
      );
    }

    const refresh = JSON.parse(refreshRaw) as MobileRefreshEntry;
    msRefreshToken = refresh.ms_refresh_token;
    sessionOrRefresh = refresh;
  }

  const tokens = await refreshMicrosoftAccessToken(c, msRefreshToken, {
    includeClientAssertion: clientType === 'web',
  });

  if (!tokens?.access_token) {
    return errorResponse(
      c,
      401,
      'GRAPH_TOKEN_EXCHANGE_FAILED',
      'Microsoft Graph のアクセストークン取得に失敗しました。'
    );
  }

  if (tokens.refresh_token) {
    if (clientType === 'web') {
      const session = sessionOrRefresh as Session;
      await saveSession(c, sessionId!, {
        ...session,
        ms_refresh_token: tokens.refresh_token,
      });
    } else {
      const refresh = sessionOrRefresh as MobileRefreshEntry;
      const refreshTtl = getNumberEnv(
        c.env.MOBILE_REFRESH_EXPIRES_SEC,
        7776000
      );
      await c.env.AUTH_KV.put(
        `mobile_refresh:${refreshTokenId}`,
        JSON.stringify({
          ...refresh,
          ms_refresh_token: tokens.refresh_token,
        } satisfies MobileRefreshEntry),
        { expirationTtl: refreshTtl }
      );
    }
  }

  const photoRes = await fetch(GRAPH_ME_PHOTO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (photoRes.status === 404) {
    return errorResponse(
      c,
      404,
      'PHOTO_NOT_FOUND',
      'Microsoft アカウントに写真が登録されていません。'
    );
  }

  if (!photoRes.ok) {
    return errorResponse(
      c,
      401,
      'PHOTO_FETCH_FAILED',
      'Microsoft Graph から写真を取得できませんでした。'
    );
  }

  const avatarUpdatedAt =
    sessionOrRefresh?.avatar_updated_at ?? new Date().toISOString();
  if (clientType === 'web') {
    const session = sessionOrRefresh as Session;
    await saveSession(c, sessionId!, {
      ...session,
      ms_refresh_token: tokens.refresh_token ?? session.ms_refresh_token,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: avatarUpdatedAt,
    });
  } else {
    const refresh = sessionOrRefresh as MobileRefreshEntry;
    const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
    await c.env.AUTH_KV.put(
      `mobile_refresh:${refreshTokenId}`,
      JSON.stringify({
        ...refresh,
        ms_refresh_token: tokens.refresh_token ?? refresh.ms_refresh_token,
        avatar_url: ACCOUNT_PHOTO_PATH,
        avatar_updated_at: avatarUpdatedAt,
      } satisfies MobileRefreshEntry),
      { expirationTtl: refreshTtl }
    );
  }

  const contentType = photoRes.headers.get('Content-Type') ?? 'image/jpeg';
  return new Response(photoRes.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// POST /auth/logout
account.post('/logout', async c => {
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

  return new Response(JSON.stringify({ message: 'Logged out successfully' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(shouldUseSecureCookie(c)),
    },
  });
});

// POST /auth/refresh
account.post('/refresh', async c => {
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
    {
      includeClientAssertion: false,
    }
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
    {
      expirationTtl: refreshTtl,
    }
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

export { account };
