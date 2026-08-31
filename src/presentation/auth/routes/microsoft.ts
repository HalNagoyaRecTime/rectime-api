import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import {
  generateRandom,
  generateCodeChallenge,
} from '../../../infrastructure/auth/pkce';
import { verifyIdToken } from '../../../infrastructure/auth/verifyIdToken';
import { signAccessToken } from '../../../infrastructure/auth/jwt';
import {
  getClientType,
  getNumberEnv,
  isValidBase64Url,
  hasMinimumDecodedBytes,
  buildMicrosoftAuthorizeUrl,
  buildWebRedirectUri,
  exchangeMicrosoftToken,
  upsertUser,
  userResponse,
  getStudentInfoOrNull,
  getUserCategories,
} from '../helpers';
import {
  type PkceEntry,
  type MobileRefreshEntry,
  type DeletionConfirmationEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import type { ContainerVariables } from '../../middleware/diContainer';
import { createUserRepository } from '../../../infrastructure/repositories/UserRepository';
import { AuthErrors } from '../../errors/authErrors';
import { errorResponse } from '../../errors/errorResponse';

const DELETION_CONFIRMATION_TTL_SEC = 600;

const microsoft = new Hono<{
  Bindings: Bindings;
  Variables: ContainerVariables;
}>();

// GET /auth/microsoft/login
microsoft.get('/login', async c => {
  const clientType = getClientType(c);
  if (!clientType) {
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
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
      return errorResponse(c, AuthErrors.INVALID_REQUEST);
    }

    const pkceKey = `pkce:${state}`;
    const existingPkce = await c.env.AUTH_KV.get(pkceKey);
    if (existingPkce) {
      return errorResponse(c, AuthErrors.STATE_ALREADY_EXISTS);
    }

    await c.env.AUTH_KV.put(
      pkceKey,
      JSON.stringify({
        nonce,
        client_type: 'mobile',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry),
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
      purpose: 'login',
      created_at: new Date().toISOString(),
    } satisfies PkceEntry),
    { expirationTtl: 600 }
  );

  return c.redirect(
    buildMicrosoftAuthorizeUrl(
      c,
      buildWebRedirectUri(c),
      state,
      codeChallenge,
      nonce
    ),
    302
  );
});

// GET /auth/microsoft/delete-login
microsoft.get('/delete-login', async c => {
  const clientType = getClientType(c);
  if (!clientType) {
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
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
      return errorResponse(c, AuthErrors.INVALID_REQUEST);
    }

    const pkceKey = `pkce:${state}`;
    const existingPkce = await c.env.AUTH_KV.get(pkceKey);
    if (existingPkce) {
      return errorResponse(c, AuthErrors.STATE_ALREADY_EXISTS);
    }

    await c.env.AUTH_KV.put(
      pkceKey,
      JSON.stringify({
        nonce,
        client_type: 'mobile',
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry),
      { expirationTtl: 600 }
    );

    return c.json({
      auth_url: buildMicrosoftAuthorizeUrl(
        c,
        c.env.MICROSOFT_MOBILE_REDIRECT_URI,
        state,
        codeChallenge,
        nonce,
        'login'
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
      purpose: 'account_deletion',
      created_at: new Date().toISOString(),
    } satisfies PkceEntry),
    { expirationTtl: 600 }
  );

  return c.redirect(
    buildMicrosoftAuthorizeUrl(
      c,
      buildWebRedirectUri(c),
      state,
      codeChallenge,
      nonce,
      'login'
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

  return c.redirect(
    `${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    302
  );
});

// POST /auth/microsoft/token
microsoft.post('/token', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'mobile' && clientType !== 'web') {
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
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
    body.state.length === 0
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }

  if (
    clientType === 'mobile' &&
    (typeof body.code_verifier !== 'string' ||
      body.code_verifier.length < 43 ||
      body.code_verifier.length > 128 ||
      !isValidBase64Url(body.code_verifier))
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }

  const pkceRaw = await c.env.AUTH_KV.get(`pkce:${body.state}`);
  if (!pkceRaw) {
    return errorResponse(c, AuthErrors.STATE_MISMATCH);
  }

  await c.env.AUTH_KV.delete(`pkce:${body.state}`);
  const pkce = JSON.parse(pkceRaw) as PkceEntry;

  if (pkce.client_type !== clientType) {
    return errorResponse(c, AuthErrors.INVALID_STATE_CLIENT_TYPE);
  }

  if (pkce.purpose && pkce.purpose !== 'login') {
    return errorResponse(c, AuthErrors.INVALID_STATE_PURPOSE);
  }

  const codeVerifier =
    clientType === 'mobile'
      ? (body.code_verifier as string)
      : pkce.code_verifier;

  if (!codeVerifier) {
    return errorResponse(c, AuthErrors.CODE_VERIFIER_MISSING);
  }

  const tokens = await exchangeMicrosoftToken(
    c,
    {
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri:
        clientType === 'mobile'
          ? c.env.MICROSOFT_MOBILE_REDIRECT_URI
          : buildWebRedirectUri(c),
      code_verifier: codeVerifier,
    },
    { includeClientAssertion: clientType === 'web' }
  );

  if (!tokens?.id_token || !tokens.refresh_token) {
    return errorResponse(c, AuthErrors.TOKEN_EXCHANGE_FAILED);
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
    return errorResponse(c, AuthErrors.INVALID_ID_TOKEN);
  }

  let user;
  try {
    user = await upsertUser(c, claims);
  } catch (err) {
    if (err instanceof Error && err.message === 'STUDENT_ALREADY_LINKED') {
      return errorResponse(c, AuthErrors.STUDENT_ALREADY_LINKED);
    }
    if (err instanceof Error && err.message === 'ACCOUNT_DELETION_PENDING') {
      return errorResponse(c, AuthErrors.ACCOUNT_DELETION_PENDING);
    }
    throw err;
  }

  const { studentService } = c.get('container');
  const student = await getStudentInfoOrNull(studentService, Number(user.id));

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
      client_type: clientType,
      ms_refresh_token: tokens.refresh_token,
      created_at: new Date().toISOString(),
    } satisfies MobileRefreshEntry),
    { expirationTtl: refreshTtl }
  );

  await c.env.AUTH_KV.put(`mobile_refresh_by_user:${user.id}`, refreshTokenId, {
    expirationTtl: refreshTtl,
  });

  const jwtTtl = getNumberEnv(c.env.JWT_EXPIRES_SEC, 3600);
  const accessToken = await signAccessToken(
    {
      sub: user.id,
      oid: user.oid,
      email: user.email,
      display_name: user.display_name,
      avatar_url: ACCOUNT_PHOTO_PATH,
      avatar_updated_at: null,
      client_type: clientType,
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

// POST /auth/microsoft/delete-token
microsoft.post('/delete-token', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'mobile' && clientType !== 'web') {
    return errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE);
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
    body.state.length === 0
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }

  if (
    clientType === 'mobile' &&
    (typeof body.code_verifier !== 'string' ||
      body.code_verifier.length < 43 ||
      body.code_verifier.length > 128 ||
      !isValidBase64Url(body.code_verifier))
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }

  const pkceRaw = await c.env.AUTH_KV.get(`pkce:${body.state}`);
  if (!pkceRaw) {
    return errorResponse(c, AuthErrors.STATE_MISMATCH);
  }

  await c.env.AUTH_KV.delete(`pkce:${body.state}`);
  const pkce = JSON.parse(pkceRaw) as PkceEntry;

  if (pkce.client_type !== clientType) {
    return errorResponse(c, AuthErrors.INVALID_STATE_CLIENT_TYPE);
  }

  if (pkce.purpose !== 'account_deletion') {
    return errorResponse(c, AuthErrors.INVALID_STATE_PURPOSE);
  }

  const codeVerifier =
    clientType === 'mobile'
      ? (body.code_verifier as string)
      : pkce.code_verifier;

  if (!codeVerifier) {
    return errorResponse(c, AuthErrors.CODE_VERIFIER_MISSING);
  }

  const tokens = await exchangeMicrosoftToken(
    c,
    {
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri:
        clientType === 'mobile'
          ? c.env.MICROSOFT_MOBILE_REDIRECT_URI
          : buildWebRedirectUri(c),
      code_verifier: codeVerifier,
    },
    { includeClientAssertion: clientType === 'web' }
  );

  if (!tokens?.id_token) {
    return errorResponse(c, AuthErrors.TOKEN_EXCHANGE_FAILED);
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
    return errorResponse(c, AuthErrors.INVALID_ID_TOKEN);
  }

  const userRepository = createUserRepository(c.env.DB);
  const userId = await userRepository.findUserIdByMicrosoftAccount(
    claims.oid,
    claims.tid
  );

  if (!userId) {
    return errorResponse(c, AuthErrors.ACCOUNT_NOT_FOUND);
  }

  const deletionToken = crypto.randomUUID();
  await c.env.AUTH_KV.put(
    `deletion_confirmation:${deletionToken}`,
    JSON.stringify({
      user_id: userId,
      created_at: new Date().toISOString(),
    } satisfies DeletionConfirmationEntry),
    { expirationTtl: DELETION_CONFIRMATION_TTL_SEC }
  );

  return c.json({
    deletion_confirmation_token: deletionToken,
    expires_in: DELETION_CONFIRMATION_TTL_SEC,
  });
});

export { microsoft };
