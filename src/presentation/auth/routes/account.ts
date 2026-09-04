import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import type { ContainerVariables } from '../../middleware/diContainer';
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from '../../../infrastructure/auth/jwt';
import {
  getClientType,
  getNumberEnv,
  getBearerToken,
  refreshMicrosoftAccessToken,
  userResponse,
  getStudentInfoOrNull,
  getUserCategories,
} from '../helpers';
import { rejectInactiveUser } from '../rejectInactiveUser';
import {
  type MobileRefreshEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import { GRAPH_ME_PHOTO_URL } from '../../../infrastructure/auth/microsoftClient';
import { createUserRepository } from '../../../infrastructure/repositories/UserRepository';
import { AuthErrors } from '../../errors/authErrors';
import { CommonErrors } from '../../errors/commonErrors';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../../errors/errorResponse';
import type { AppContext } from '../helpers';

const account = new Hono<{
  Bindings: Bindings;
  Variables: ContainerVariables;
}>();

type ActiveAuthResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; response: Response };

// Bearer Tokenの署名検証に加え、DB上のdeletion_statusを確認する。
// JWTは自己完結検証のため、削除開始(deletion_status !== 'active')後も
// exp到達までは署名だけなら有効であり続けてしまう(#265 PR3)。/me・
// /me/photo・/logoutはbearerAuthenticationMiddleware(apiV1.use('*', ...))
// を経由してはいるが、その結果(verifiedAuthUser)を使わずここで
// verifyAccessTokenを再実行しているため、ミドルウェア側のdeletion_status
// チェックの効果を受けない。ここで改めて確認することで、削除済み/削除中
// ユーザーのAccess Tokenでは/meが情報を返さないようにする。
async function authenticateActiveUser(
  c: AppContext,
  clientType: 'web' | 'mobile',
  invalidTokenError: ApiErrorDefinition = CommonErrors.UNAUTHORIZED,
  sessionExpiredError: ApiErrorDefinition = invalidTokenError
): Promise<ActiveAuthResult> {
  const token = getBearerToken(c);
  if (!token) {
    return { ok: false, response: errorResponse(c, CommonErrors.UNAUTHORIZED) };
  }

  let claims: AccessTokenClaims;
  try {
    claims = await verifyAccessToken(token, c.env.JWT_SECRET, clientType);
  } catch (error) {
    const isSessionExpired =
      error instanceof Error && error.message === 'SESSION_EXPIRED';
    return {
      ok: false,
      response: errorResponse(
        c,
        isSessionExpired ? sessionExpiredError : invalidTokenError
      ),
    };
  }

  const userRepository = createUserRepository(c.env.DB);
  const deletionStatus = await userRepository.getDeletionStatus(claims.sub);
  if (deletionStatus && deletionStatus !== 'active') {
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.ACCOUNT_DELETION_PENDING),
    };
  }

  return { ok: true, claims };
}

// GET /auth/me
account.get('/me', async c => {
  const { studentService } = c.get('container');
  const clientType = getClientType(c);
  if (clientType !== 'web' && clientType !== 'mobile') {
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
  }

  const auth = await authenticateActiveUser(
    c,
    clientType,
    AuthErrors.INVALID_TOKEN,
    AuthErrors.SESSION_EXPIRED
  );
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const rejected = await rejectInactiveUser(c, claims.sub);
  if (rejected) return rejected;

  const student = await getStudentInfoOrNull(
    studentService,
    Number(claims.sub)
  );

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
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
  }

  const auth = await authenticateActiveUser(c, clientType);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const rejected = await rejectInactiveUser(c, claims.sub);
  if (rejected) return rejected;

  // mobile_refresh KV は mobile/web 共通で使う。Microsoft の refresh_token を
  // sub 単位で保持している(POST /auth/microsoft/token 参照)。
  const refreshTokenId = await c.env.AUTH_KV.get(
    `mobile_refresh_by_user:${claims.sub}`
  );
  if (!refreshTokenId) {
    return errorResponse(c, AuthErrors.SESSION_EXPIRED);
  }

  const refreshRaw = await c.env.AUTH_KV.get(
    `mobile_refresh:${refreshTokenId}`
  );
  if (!refreshRaw) {
    return errorResponse(c, AuthErrors.SESSION_EXPIRED);
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
    return errorResponse(c, AuthErrors.GRAPH_TOKEN_EXCHANGE_FAILED);
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
    return errorResponse(c, AuthErrors.PHOTO_NOT_FOUND);
  }

  if (!photoRes.ok) {
    return errorResponse(c, AuthErrors.PHOTO_FETCH_FAILED);
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
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
  }

  const auth = await authenticateActiveUser(c, clientType);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

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
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
  }

  const body = (await c.req.json().catch(() => null)) as {
    refresh_token_id?: unknown;
  } | null;
  if (
    !body ||
    typeof body.refresh_token_id !== 'string' ||
    body.refresh_token_id.length === 0
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }

  const refreshKey = `mobile_refresh:${body.refresh_token_id}`;
  const refreshRaw = await c.env.AUTH_KV.get(refreshKey);
  if (!refreshRaw) {
    return errorResponse(c, AuthErrors.SESSION_EXPIRED);
  }

  const refresh = JSON.parse(refreshRaw) as MobileRefreshEntry;
  if (refresh.client_type !== clientType) {
    // refresh_token_id は発行時のクライアント種別に紐づく。異なる
    // X-Client-Type で再発行しようとした場合は拒否し、なりすましで
    // 別種別のアクセストークンを取得できないようにする。
    return errorResponse(c, AuthErrors.INVALID_REFRESH_CLIENT_TYPE);
  }

  // アカウント削除開始後は、有効なrefresh_token_idを持っていても
  // 新しいAccess Tokenを発行しない。
  const userRepository = createUserRepository(c.env.DB);
  const deletionStatus = await userRepository.getDeletionStatus(
    refresh.user_id
  );
  if (deletionStatus && deletionStatus !== 'active') {
    return errorResponse(c, AuthErrors.ACCOUNT_DELETION_PENDING);
  }

  // 無効化されたユーザーの再発行を断る(#255)。deletion_status(本人による削除)
  // とis_live_active(管理者による無効化)は独立した軸のため、両方を確認する。
  // 塞がないとmobile_refreshのTTLが再発行のたびに振り直され、無効化後も
  // 延び続けてしまう。
  // エントリは削除しない: 一時的な無効化なので、再度有効化されたときに
  // 元のTTLが切れるまでは同じセッションを再開できるようにする。
  const rejected = await rejectInactiveUser(c, refresh.user_id);
  if (rejected) return rejected;

  const tokens = await refreshMicrosoftAccessToken(
    c,
    refresh.ms_refresh_token,
    {
      includeClientAssertion: clientType === 'web',
    }
  );
  if (!tokens?.refresh_token) {
    return errorResponse(c, AuthErrors.REFRESH_TOKEN_EXPIRED);
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
