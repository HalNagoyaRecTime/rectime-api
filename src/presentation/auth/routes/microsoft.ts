import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import {
  generateRandom,
  generateCodeChallenge,
} from '../../../infrastructure/auth/pkce';
import { verifyIdToken } from '../../../infrastructure/auth/verifyIdToken';
import { signMobileJwt } from '../../../infrastructure/auth/jwt';
import {
  createSession,
  buildSessionCookie,
} from '../../../infrastructure/auth/session';
import {
  errorResponse,
  getClientType,
  getNumberEnv,
  shouldUseSecureCookie,
  isValidBase64Url,
  hasMinimumDecodedBytes,
  buildMicrosoftAuthorizeUrl,
  exchangeMicrosoftToken,
  upsertUser,
  userResponse,
  getUserCategories,
} from '../helpers';
import {
  type PkceEntry,
  type MobileRefreshEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import type { ContainerVariables } from '../../middleware/diContainer';

const microsoft = new Hono<{
  Bindings: Bindings;
  Variables: ContainerVariables;
}>();

// GET /auth/microsoft/login
microsoft.get('/login', async c => {
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

    const pkceKey = `pkce:${state}`;
    const existingPkce = await c.env.AUTH_KV.get(pkceKey);
    if (existingPkce) {
      return errorResponse(
        c,
        400,
        'STATE_ALREADY_EXISTS',
        '同じ state の認証処理がすでに開始されています。'
      );
    }

    await c.env.AUTH_KV.put(
      pkceKey,
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
microsoft.get('/callback', async c => {
  const { code, state, error } = c.req.query();
  const frontendUrl = c.env.FRONTEND_URL;

  if (error || !code || !state) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }

  const pkceRaw = await c.env.AUTH_KV.get(`pkce:${state}`);
  if (!pkceRaw) {
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }
  await c.env.AUTH_KV.delete(`pkce:${state}`);

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

  try {
    const claims = await verifyIdToken(
      tokens.id_token,
      c.env.AUTH_KV,
      c.env.MICROSOFT_CLIENT_ID,
      pkce.nonce,
      c.env.MICROSOFT_TENANT,
      c.env.ALLOWED_MICROSOFT_TENANTS
    );

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
  } catch (error) {
    console.error('[Auth] Microsoft callback failed', error);
    return c.redirect(`${frontendUrl}/login?error=auth_failed`, 302);
  }
});

// POST /auth/microsoft/token
microsoft.post('/token', async c => {
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
  await c.env.AUTH_KV.delete(`pkce:${body.state}`);

  const pkce = JSON.parse(pkceRaw) as PkceEntry;
  if (pkce.client_type !== 'mobile') {
    return errorResponse(
      c,
      400,
      'INVALID_STATE_CLIENT_TYPE',
      'state のクライアント種別が不正です。'
    );
  }

  const tokens = await exchangeMicrosoftToken(
    c,
    {
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri: c.env.MICROSOFT_MOBILE_REDIRECT_URI,
      code_verifier: body.code_verifier,
    },
    { includeClientAssertion: false }
  );
  if (!tokens?.id_token || !tokens.refresh_token) {
    return errorResponse(
      c,
      401,
      'TOKEN_EXCHANGE_FAILED',
      'Microsoft とのトークン交換に失敗しました。'
    );
  }

  let claims;
  try {
    claims = await verifyIdToken(
      tokens.id_token,
      c.env.AUTH_KV,
      c.env.MICROSOFT_CLIENT_ID,
      pkce.nonce,
      c.env.MICROSOFT_TENANT,
      c.env.ALLOWED_MICROSOFT_TENANTS
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
  const { studentService } = c.get('container');
  const student = await studentService.getByUserId(Number(user.id));
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
  await c.env.AUTH_KV.put(`mobile_refresh_by_user:${user.id}`, refreshTokenId, {
    expirationTtl: refreshTtl,
  });

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

  const categories = await getUserCategories(c, user.id);

  return c.json({
    access_token: accessToken,
    refresh_token_id: refreshTokenId,
    token_type: 'Bearer',
    expires_in: jwtTtl,
    user: userResponse(
      {
        ...user,
        student_id_number: student?.student_id_number ?? null,
        class_room_name: student?.class_room_name ?? null,
      },
      categories
    ),
  });
});

export { microsoft };
