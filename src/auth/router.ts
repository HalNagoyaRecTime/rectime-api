import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings } from '../types/bindings';
import {
  base64URLtoBytes,
  generateRandom,
  generateCodeChallenge,
} from './pkce';
import { verifyIdToken, type IdTokenClaims } from './verifyIdToken';
import { signMobileJwt, verifyMobileJwt, type MobileJwtClaims } from './jwt';
import {
  createSession,
  getSession,
  deleteSession,
  getSessionIdFromCookie,
  buildSessionCookie,
  clearSessionCookie,
  type Session,
} from './session';

type AppContext = Context<{ Bindings: Bindings }>;
type ClientType = 'web' | 'mobile';

interface PkceEntry {
  code_verifier?: string;
  nonce: string;
  client_type: ClientType;
  created_at: string;
}

interface AppUser {
  id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
}

interface MicrosoftTokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

interface MobileRefreshEntry {
  user_id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
  ms_refresh_token: string;
  created_at: string;
  updated_at?: string;
}

const auth = new Hono<{ Bindings: Bindings }>();
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MICROSOFT_SCOPES = 'openid profile email offline_access User.Read';
const ACCOUNT_PHOTO_PATH = '/api/v1/auth/me/photo';
const GRAPH_ME_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photo/$value';

function errorResponse(
  c: AppContext,
  status: 400 | 401 | 404 | 500,
  code: string,
  message: string
): Response {
  return c.json({ error: { code, message } }, status);
}

function getClientType(c: AppContext): ClientType | null {
  const value = c.req.header('X-Client-Type') ?? 'web';
  if (value === 'web' || value === 'mobile') return value;
  return null;
}

function getNumberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldUseSecureCookie(c: AppContext): boolean {
  try {
    return new URL(c.env.MICROSOFT_REDIRECT_URI).protocol === 'https:';
  } catch {
    return true;
  }
}

function isValidBase64Url(value: string): boolean {
  return BASE64_URL_PATTERN.test(value);
}

function hasMinimumDecodedBytes(value: string, byteLength: number): boolean {
  try {
    return base64URLtoBytes(value).byteLength >= byteLength;
  } catch {
    return false;
  }
}

function getBearerToken(c: AppContext): string | null {
  const authorization = c.req.header('Authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  return match?.[1] ?? null;
}

function buildMicrosoftUid(claims: Pick<IdTokenClaims, 'tid' | 'oid'>): string {
  return `${claims.tid}:${claims.oid}`;
}

function buildMicrosoftAuthorizeUrl(
  c: AppContext,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  nonce: string
): string {
  const params = new URLSearchParams({
    client_id: c.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: MICROSOFT_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
    response_mode: 'query',
    prompt: 'select_account',
  });

  return `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeMicrosoftToken(
  c: AppContext,
  params: Record<string, string>,
  options?: { includeClientSecret?: boolean }
): Promise<MicrosoftTokenResponse | null> {
  const body = new URLSearchParams({
    client_id: c.env.MICROSOFT_CLIENT_ID,
    ...params,
  });
  if (options?.includeClientSecret !== false) {
    body.set('client_secret', c.env.MICROSOFT_CLIENT_SECRET);
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  return tokenRes.json() as Promise<MicrosoftTokenResponse>;
}

function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
}

async function saveSession(
  c: AppContext,
  sessionId: string,
  session: Session
): Promise<void> {
  await c.env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: getSessionTtlSeconds(session.expires_at),
  });
}

async function refreshMicrosoftAccessToken(
  c: AppContext,
  refreshToken: string,
  options?: { includeClientSecret?: boolean }
): Promise<MicrosoftTokenResponse | null> {
  return exchangeMicrosoftToken(c, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES,
  }, options);
}

async function upsertUser(
  c: AppContext,
  claims: IdTokenClaims
): Promise<AppUser> {
  const email = claims.preferred_username ?? claims.email ?? '';
  const displayName = claims.name ?? email;
  const uid = buildMicrosoftUid(claims);
  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    `SELECT u.users_id
       FROM microsoft_account_links m
       INNER JOIN users u ON u.users_id = m.users_id
      WHERE m.oid = ? AND m.tid = ?`
  )
    .bind(claims.oid, claims.tid)
    .first<{
      users_id: string;
    }>();

  let userId: string;
  if (existing) {
    userId = existing.users_id;
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE users SET display_name = ?, uid = ?, updated_at = ? WHERE users_id = ?'
      ).bind(displayName, uid, now, userId),
      c.env.DB.prepare(
        'UPDATE microsoft_account_links SET oid = ?, tid = ?, sub = ?, updated_at = ? WHERE users_id = ?'
      ).bind(claims.oid, claims.tid, claims.sub, now, userId),
    ]);
  } else {
    userId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO users (users_id, class_room_id, display_name, uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(userId, null, displayName, uid, now, now),
      c.env.DB.prepare(
        'INSERT INTO microsoft_account_links (microsoft_account_link_id, users_id, oid, tid, sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(linkId, userId, claims.oid, claims.tid, claims.sub, now, now),
    ]);
  }

  return {
    id: userId,
    oid: claims.oid,
    tid: claims.tid,
    sub: claims.sub,
    email,
    display_name: displayName,
  };
}

function userResponse(user: {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url ?? ACCOUNT_PHOTO_PATH,
    avatar_updated_at: user.avatar_updated_at ?? null,
  };
}

// GET /auth/microsoft/login
auth.get('/microsoft/login', async c => {
  const clientType = getClientType(c);
  if (!clientType) {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
  }

  const nonce = generateRandom(32);

  if (clientType === 'mobile') {
    const state = c.req.header('X-State');
    const codeChallenge = c.req.header('X-PKCE-Code-Challenge');

    if (
      !state ||
      !codeChallenge ||
      !isValidBase64Url(state) ||
      !hasMinimumDecodedBytes(state, 32) ||
      !isValidBase64Url(codeChallenge)
    ) {
      return errorResponse(
        c,
        400,
        'INVALID_REQUEST',
        'Mobile 認証開始パラメータが不正です。'
      );
    }

    await c.env.AUTH_KV.put(
      `pkce:${state}`,
      JSON.stringify({
        nonce,
        client_type: 'mobile',
        created_at: new Date().toISOString(),
      }),
      { expirationTtl: 600 }
    );

    return c.json({
      auth_url: buildMicrosoftAuthorizeUrl(
        c,
        c.env.MICROSOFT_MOBILE_REDIRECT_URI,
        state,
        codeChallenge,
        nonce
      ),
    });
  }

  const state = generateRandom(32);
  const codeVerifier = generateRandom(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  await c.env.AUTH_KV.put(
    `pkce:${state}`,
    JSON.stringify({
      code_verifier: codeVerifier,
      nonce,
      client_type: 'web',
      created_at: new Date().toISOString(),
    }),
    { expirationTtl: 600 }
  );

  return c.redirect(
    buildMicrosoftAuthorizeUrl(
      c,
      c.env.MICROSOFT_REDIRECT_URI,
      state,
      codeChallenge,
      nonce
    ),
    302
  );
});

// GET /auth/microsoft/callback
auth.get('/microsoft/callback', async c => {
  const { code, state, error } = c.req.query();
  const frontendUrl = c.env.FRONTEND_URL;

  if (error || !code || !state) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  const pkceRaw = await c.env.AUTH_KV.get(`pkce:${state}`);
  if (!pkceRaw) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  const pkce = JSON.parse(pkceRaw) as PkceEntry;
  if (pkce.client_type !== 'web' || !pkce.code_verifier) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  const tokens = await exchangeMicrosoftToken(c, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: c.env.MICROSOFT_REDIRECT_URI,
    code_verifier: pkce.code_verifier,
  });
  if (!tokens?.id_token || !tokens.refresh_token) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  let claims: IdTokenClaims;
  try {
    claims = await verifyIdToken(
      tokens.id_token,
      c.env.AUTH_KV,
      c.env.MICROSOFT_CLIENT_ID,
      pkce.nonce
    );
  } catch {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  const user = await upsertUser(c, claims);
  await c.env.AUTH_KV.delete(`pkce:${state}`);

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
      ms_refresh_token: tokens.refresh_token,
    },
    ttl
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: frontendUrl,
      'Set-Cookie': buildSessionCookie(
        sessionId,
        ttl,
        shouldUseSecureCookie(c)
      ),
    },
  });
});

// POST /auth/microsoft/token
auth.post('/microsoft/token', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'Mobile クライアント専用のエンドポイントです。'
    );
  }

  const body = (await c.req.json().catch(() => null)) as {
    code?: unknown;
    state?: unknown;
    code_verifier?: unknown;
  } | null;

  if (
    !body ||
    typeof body.code !== 'string' ||
    body.code.length === 0 ||
    typeof body.state !== 'string' ||
    body.state.length === 0 ||
    typeof body.code_verifier !== 'string' ||
    body.code_verifier.length < 43 ||
    body.code_verifier.length > 128 ||
    !isValidBase64Url(body.code_verifier)
  ) {
    return errorResponse(
      c,
      400,
      'INVALID_REQUEST',
      'リクエストボディが不正です。'
    );
  }

  const pkceRaw = await c.env.AUTH_KV.get(`pkce:${body.state}`);
  if (!pkceRaw) {
    return errorResponse(
      c,
      401,
      'STATE_MISMATCH',
      'state が一致しないか期限切れです。'
    );
  }

  const pkce = JSON.parse(pkceRaw) as PkceEntry;
  if (pkce.client_type !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_STATE_CLIENT_TYPE',
      'state のクライアント種別が不正です。'
    );
  }

  const tokens = await exchangeMicrosoftToken(c, {
    grant_type: 'authorization_code',
    code: body.code,
    redirect_uri: c.env.MICROSOFT_MOBILE_REDIRECT_URI,
    code_verifier: body.code_verifier,
  }, { includeClientSecret: false });
  if (!tokens?.id_token || !tokens.refresh_token) {
    return errorResponse(
      c,
      401,
      'TOKEN_EXCHANGE_FAILED',
      'Microsoft とのトークン交換に失敗しました。'
    );
  }

  let claims: IdTokenClaims;
  try {
    claims = await verifyIdToken(
      tokens.id_token,
      c.env.AUTH_KV,
      c.env.MICROSOFT_CLIENT_ID,
      pkce.nonce
    );
  } catch {
    return errorResponse(
      c,
      401,
      'INVALID_ID_TOKEN',
      'id_token の検証に失敗しました。'
    );
  }

  const user = await upsertUser(c, claims);
  const refreshTokenId = crypto.randomUUID();
  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);

  await c.env.AUTH_KV.put(
    `mobile_refresh:${refreshTokenId}`,
    JSON.stringify({
      user_id: user.id,
      oid: user.oid,
      tid: user.tid,
      sub: user.sub,
      email: user.email,
      display_name: user.display_name,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: null,
      ms_refresh_token: tokens.refresh_token,
      created_at: new Date().toISOString(),
    } satisfies MobileRefreshEntry),
    { expirationTtl: refreshTtl }
  );
  await c.env.AUTH_KV.put(
    `mobile_refresh_by_user:${user.id}`,
    refreshTokenId,
    { expirationTtl: refreshTtl }
  );
  await c.env.AUTH_KV.delete(`pkce:${body.state}`);

  const jwtTtl = getNumberEnv(c.env.JWT_EXPIRES_SEC, 3600);
  const accessToken = await signMobileJwt(
    {
      sub: user.id,
      oid: user.oid,
      email: user.email,
      display_name: user.display_name,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: null,
      client_type: 'mobile',
    },
    c.env.JWT_SECRET,
    jwtTtl
  );

  return c.json({
    access_token: accessToken,
    refresh_token_id: refreshTokenId,
    token_type: 'Bearer',
    expires_in: jwtTtl,
    user: userResponse(user),
  });
});

// GET /auth/me
auth.get('/me', async c => {
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

// GET /auth/me/photo
auth.get('/me/photo', async c => {
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
  let sessionOrRefresh: any = null;

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

    refreshTokenId = await c.env.AUTH_KV.get(`mobile_refresh_by_user:${claims.sub}`);
    if (!refreshTokenId) {
      return errorResponse(
        c,
        401,
        'SESSION_EXPIRED',
        'セッションが見つかりません。'
      );
    }

    const refreshRaw = await c.env.AUTH_KV.get(`mobile_refresh:${refreshTokenId}`);
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
    includeClientSecret: clientType === 'web',
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
      await saveSession(c, sessionId!, {
        ...sessionOrRefresh,
        ms_refresh_token: tokens.refresh_token,
      });
    } else {
      const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
      await c.env.AUTH_KV.put(
        `mobile_refresh:${refreshTokenId}`,
        JSON.stringify({
          ...sessionOrRefresh,
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

  const avatarUpdatedAt = sessionOrRefresh.avatar_updated_at ?? new Date().toISOString();
  if (clientType === 'web') {
    await saveSession(c, sessionId!, {
      ...sessionOrRefresh,
      ms_refresh_token: tokens.refresh_token ?? sessionOrRefresh.ms_refresh_token,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: avatarUpdatedAt,
    });
  } else {
    const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
    await c.env.AUTH_KV.put(
      `mobile_refresh:${refreshTokenId}`,
      JSON.stringify({
        ...sessionOrRefresh,
        ms_refresh_token: tokens.refresh_token ?? sessionOrRefresh.ms_refresh_token,
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
auth.post('/logout', async c => {
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
      await verifyMobileJwt(token, c.env.JWT_SECRET);
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
auth.post('/refresh', async c => {
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

    const tokens = await refreshMicrosoftAccessToken(c, session.ms_refresh_token);
    if (!tokens?.refresh_token) {
      return errorResponse(
        c,
        401,
        'REFRESH_TOKEN_EXPIRED',
        '再ログインが必要です。'
      );
    }

    const ttl = getNumberEnv(c.env.SESSION_EXPIRES_SEC, 86400);
    await c.env.AUTH_KV.put(
      `session:${sessionId}`,
      JSON.stringify({
        ...session,
        ms_refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      }),
      { expirationTtl: ttl }
    );

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
  const tokens = await refreshMicrosoftAccessToken(c, refresh.ms_refresh_token, {
    includeClientSecret: false,
  });
  if (!tokens?.refresh_token) {
    return errorResponse(
      c,
      401,
      'REFRESH_TOKEN_EXPIRED',
      '再ログインが必要です。'
    );
  }

  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
  await c.env.AUTH_KV.put(
    refreshKey,
    JSON.stringify({
      ...refresh,
      ms_refresh_token: tokens.refresh_token,
      updated_at: new Date().toISOString(),
    } satisfies MobileRefreshEntry),
    { expirationTtl: refreshTtl }
  );
  await c.env.AUTH_KV.put(
    `mobile_refresh_by_user:${refresh.user_id}`,
    body.refresh_token_id,
    { expirationTtl: refreshTtl }
  );

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
    refresh_token_id: body.refresh_token_id,
    token_type: 'Bearer',
    expires_in: jwtTtl,
  });
});

export { auth as authRouter };
