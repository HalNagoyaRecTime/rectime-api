import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import type { ContainerVariables } from '../../middleware/diContainer';
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from '../../../infrastructure/auth/jwt';
import {
  errorResponse,
  getClientType,
  getNumberEnv,
  getBearerToken,
  refreshMicrosoftAccessToken,
  userResponse,
  getUserCategories,
} from '../helpers';
import {
  type MobileRefreshEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import { GRAPH_ME_PHOTO_URL } from '../../../infrastructure/auth/microsoftClient';

const account = new Hono<{
  Bindings: Bindings;
  Variables: ContainerVariables;
}>();

// GET /auth/me
account.get('/me', async c => {
  const { studentService } = c.get('container');
  const clientType = getClientType(c);
  if (clientType !== 'web' && clientType !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
  }


  const token = getBearerToken(c);
  if (!token) {
    return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
  }

  let claims: AccessTokenClaims;
  try {
    claims = await verifyAccessToken(token, c.env.JWT_SECRET, clientType);
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
  
  const student = await studentService.getByUserId(Number(claims.sub));
  const categories = await getUserCategories(c, claims.sub);
  return c.json({
    user: userResponse(
      {
        id: claims.sub,
        email: claims.email,
        display_name: claims.display_name,
        avatar_url: claims.avatar_url ?? ACCOUNT_PHOTO_PATH,
        avatar_updated_at: claims.avatar_updated_at ?? null,
        student_id_number: student?.student_id_number ?? null,
        class_room_name: student?.class_room_name ?? null,
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

  const token = getBearerToken(c);
  if (!token) {
    return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
  }

  let claims: AccessTokenClaims;
  try {
    claims = await verifyAccessToken(token, c.env.JWT_SECRET, clientType);
  } catch {
    return errorResponse(c, 401, 'UNAUTHORIZED', '認証が不正です。');
  }

  // mobile_refresh KV は mobile/web 共通で使う。Microsoft の refresh_token を
  // sub 単位で保持している(POST /auth/microsoft/token 参照)。
  const refreshTokenId = await c.env.AUTH_KV.get(
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

  const tokens = await refreshMicrosoftAccessToken(
    c,
    refresh.ms_refresh_token,
    {
      includeClientAssertion: clientType === 'web',
    }
  );

  if (!tokens?.access_token) {
    return errorResponse(
      c,
      401,
      'GRAPH_TOKEN_EXCHANGE_FAILED',
      'Microsoft Graph のアクセストークン取得に失敗しました。'
    );
  }

  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);
  if (tokens.refresh_token) {
    await c.env.AUTH_KV.put(
      `mobile_refresh:${refreshTokenId}`,
      JSON.stringify({
        ...refresh,
        ms_refresh_token: tokens.refresh_token,
      } satisfies MobileRefreshEntry),
      { expirationTtl: refreshTtl }
    );
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

  const avatarUpdatedAt = refresh.avatar_updated_at ?? new Date().toISOString();
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
// mobile/web共通: refresh_token_id が保持するMicrosoftリフレッシュトークンの
// KVエントリを破棄する。
account.post('/logout', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'web' && clientType !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
  }

  const token = getBearerToken(c);
  if (!token) {
    return errorResponse(c, 401, 'UNAUTHORIZED', '認証が必要です。');
  }

  let claims: AccessTokenClaims;
  try {
    claims = await verifyAccessToken(token, c.env.JWT_SECRET, clientType);
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
    // 呼び出し元が認証されたユーザー自身のrefresh_token_idのみを削除できる
    // ようにする(他ユーザーのrefresh_token_idを渡された場合に誤って
    // そのセッションを破棄してしまわないようにするための所有者チェック)。
    const refreshRaw = await c.env.AUTH_KV.get(
      `mobile_refresh:${body.refresh_token_id}`
    );
    if (refreshRaw) {
      const entry = JSON.parse(refreshRaw) as MobileRefreshEntry;
      if (entry.user_id === claims.sub) {
        await c.env.AUTH_KV.delete(`mobile_refresh:${body.refresh_token_id}`);
      }
    }
  }
  await c.env.AUTH_KV.delete(`mobile_refresh_by_user:${claims.sub}`);

  return c.json({ message: 'Logged out successfully' });
});

// POST /auth/refresh
// mobile/web共通: refresh_token_id を使ってrectime-apiのアクセストークンを
// 再発行する。refresh_token_id はローテーションし、レスポンスの
// client_type は要求元(X-Client-Type)に合わせる。
account.post('/refresh', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'web' && clientType !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
    );
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
  if (refresh.client_type !== clientType) {
    // refresh_token_id は発行時のクライアント種別に紐づく。異なる
    // X-Client-Type で再発行しようとした場合は拒否し、なりすましで
    // 別種別のアクセストークンを取得できないようにする。
    return errorResponse(
      c,
      400,
      'INVALID_REFRESH_CLIENT_TYPE',
      'refresh_token_id のクライアント種別が不正です。'
    );
  }

  const tokens = await refreshMicrosoftAccessToken(
    c,
    refresh.ms_refresh_token,
    {
      includeClientAssertion: clientType === 'web',
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
  const accessToken = await signAccessToken(
    {
      sub: refresh.user_id,
      oid: refresh.oid,
      email: refresh.email,
      display_name: refresh.display_name,
      avatar_url: refresh.avatar_url ?? ACCOUNT_PHOTO_PATH,
      avatar_updated_at: refresh.avatar_updated_at ?? null,
      client_type: clientType,
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
