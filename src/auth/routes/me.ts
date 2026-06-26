import { Hono } from 'hono';
import type { Env as Bindings } from '../../lib/env';
import { verifyMobileJwt, type MobileJwtClaims } from '../jwt';
import { getSession, getSessionIdFromCookie, type Session } from '../session';
import {
  errorResponse,
  getClientType,
  getNumberEnv,
  getBearerToken,
  saveSession,
  refreshMicrosoftAccessToken,
} from '../helpers';
import { userResponse } from '../helpers';
import {
  type MobileRefreshEntry,
  ACCOUNT_PHOTO_PATH,
  GRAPH_ME_PHOTO_URL,
} from '../types';

const meRouter = new Hono<{ Bindings: Bindings }>();

meRouter.get('/', async c => {
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
      return c.json({
        user: userResponse({
          id: claims.sub,
          email: claims.email,
          display_name: claims.display_name,
          avatar_url: claims.avatar_url ?? ACCOUNT_PHOTO_PATH,
          avatar_updated_at: claims.avatar_updated_at ?? null,
        }),
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

  return c.json({
    user: userResponse({
      id: session.user_id,
      email: session.email,
      display_name: session.display_name,
      avatar_url: session.avatar_url ?? ACCOUNT_PHOTO_PATH,
      avatar_updated_at: session.avatar_updated_at ?? null,
    }),
  });
});

meRouter.get('/photo', async c => {
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

export { meRouter };
