import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import {
  generateRandom,
  generateCodeChallenge,
} from '../../../infrastructure/auth/pkce';
import { verifyIdToken } from '../../../infrastructure/auth/verifyIdToken';
import { signAccessToken } from '../../../infrastructure/auth/jwt';
import {
  errorResponse,
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

const DELETION_CONFIRMATION_TTL_SEC = 600;

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
// アカウント削除確認専用のMicrosoft再認証を開始する。/login と同じ
// PKCE/state発行の仕組みを使うが、KVのpurposeを'account_deletion'にする
// ことで、/delete-token側がupsertUserや一般API用Tokenの発行に進まない
// ようにする。
microsoft.get('/delete-login', async c => {
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
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry),
      { expirationTtl: 600 }
    );

    return c.json({
      // prompt=login で資格情報の再入力を強制する(削除確認フローの目的は
      // 「今操作している本人」の再認証であり、prompt=select_accountのままだと
      // Microsoft側のセッションが残っている場合に無入力で認証が完了し得るため)。
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

  // 戻り先はFRONTEND_URL固定(既存/callbackと同じリダイレクト先)。
  // クライアントからreturn_toを受け取らないことで、削除確認フローが
  // 任意のオリジンへのオープンリダイレクトに使われることを防ぐ。
  // prompt=login については上記mobile側の分岐と同じ理由。
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
// Microsoft からのリダイレクトを受け、code/state をフロントエンドの
// /auth/callback へそのまま中継するだけ。トークン交換は行わない
// (フロントエンドが POST /auth/microsoft/token で自ら交換する)。
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
// Mobile/Web 共通: authorization code を Microsoft のトークンと交換し、
// rectime-api 自身のアクセストークンを発行する。
// - mobile: code_verifier はクライアントが生成し、ボディで送信する。
// - web: code_verifier は /auth/microsoft/login 時にサーバー側で生成・
//   KV 保存済みのものを使うため、ボディでは code/state のみを要求する。
microsoft.post('/token', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'mobile' && clientType !== 'web') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
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
    body.state.length === 0
  ) {
    return errorResponse(
      c,
      400,
      'INVALID_REQUEST',
      'リクエストボディが不正です。'
    );
  }

  if (
    clientType === 'mobile' &&
    (typeof body.code_verifier !== 'string' ||
      body.code_verifier.length < 43 ||
      body.code_verifier.length > 128 ||
      !isValidBase64Url(body.code_verifier))
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
  if (pkce.client_type !== clientType) {
    return errorResponse(
      c,
      400,
      'INVALID_STATE_CLIENT_TYPE',
      'state のクライアント種別が不正です。'
    );
  }
  if (pkce.purpose && pkce.purpose !== 'login') {
    // /delete-login で発行された state がこちらに紛れ込んだ場合、
    // upsertUserや一般API用Tokenの発行に進んでしまうため拒否する。
    // purposeが未設定の場合はpurpose導入前(デプロイ境界をまたいで
    // Microsoft認証中だった)の通常ログインとして扱い、拒否しない。
    // 削除確認フロー側は必ずpurpose: 'account_deletion'を書き込むため、
    // 削除用のstateがここに紛れ込むことはない。
    return errorResponse(
      c,
      400,
      'INVALID_STATE_PURPOSE',
      'state の用途が不正です。'
    );
  }

  const codeVerifier =
    clientType === 'mobile'
      ? (body.code_verifier as string)
      : pkce.code_verifier;
  if (!codeVerifier) {
    // state 自体は見つかっているが code_verifier だけが欠けているケース
    // （webでpkceエントリにcode_verifierが保存されていない等）。
    // stateの不一致・期限切れ（STATE_MISMATCH）とは原因が異なるため区別する。
    return errorResponse(
      c,
      401,
      'CODE_VERIFIER_MISSING',
      'code_verifier が見つかりません。もう一度ログインをやり直してください。'
    );
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

  let user;
  try {
    user = await upsertUser(c, claims);
  } catch (err) {
    if (err instanceof Error && err.message === 'STUDENT_ALREADY_LINKED') {
      return errorResponse(
        c,
        409,
        'STUDENT_ALREADY_LINKED',
        'この学生は既に別のMicrosoftアカウントと連携されています。'
      );
    }
    if (err instanceof Error && err.message === 'ACCOUNT_DELETION_PENDING') {
      return errorResponse(
        c,
        410,
        'ACCOUNT_DELETION_PENDING',
        'このアカウントは削除処理中または削除済みのため、ログインできません。'
      );
    }
    throw err;
  }
  const { studentService } = c.get('container');
  const student = await getStudentInfoOrNull(studentService, Number(user.id));
  const refreshTokenId = crypto.randomUUID();
  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);

  // mobile_refresh KV は mobile/web 共通で使う。Microsoft の refresh_token を
  // sub 単位で保持し、/auth/me/photo からの Graph アクセストークン取得に使う。
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
// アカウント削除確認専用。/token とPKCE検証・Microsoftとのトークン交換・
// id_token検証までは共通だが、ここから先はupsertUser（新規作成・
// Student紐付け・一般API用Tokenの発行）を一切行わない。
// 既存アカウントの照合のみ行い、見つかった場合に一回限り・短期間の
// 削除確認Token（不透明な文字列）を発行する。
microsoft.post('/delete-token', async c => {
  const clientType = getClientType(c);
  if (clientType !== 'mobile' && clientType !== 'web') {
    return errorResponse(
      c,
      400,
      'INVALID_CLIENT_TYPE',
      'クライアント種別が不正です。'
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
    body.state.length === 0
  ) {
    return errorResponse(
      c,
      400,
      'INVALID_REQUEST',
      'リクエストボディが不正です。'
    );
  }

  if (
    clientType === 'mobile' &&
    (typeof body.code_verifier !== 'string' ||
      body.code_verifier.length < 43 ||
      body.code_verifier.length > 128 ||
      !isValidBase64Url(body.code_verifier))
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
  if (pkce.client_type !== clientType) {
    return errorResponse(
      c,
      400,
      'INVALID_STATE_CLIENT_TYPE',
      'state のクライアント種別が不正です。'
    );
  }
  if (pkce.purpose !== 'account_deletion') {
    // /login で発行された state がこちらに紛れ込んだ場合を拒否する。
    return errorResponse(
      c,
      400,
      'INVALID_STATE_PURPOSE',
      'state の用途が不正です。'
    );
  }

  const codeVerifier =
    clientType === 'mobile'
      ? (body.code_verifier as string)
      : pkce.code_verifier;
  if (!codeVerifier) {
    return errorResponse(
      c,
      401,
      'CODE_VERIFIER_MISSING',
      'code_verifier が見つかりません。もう一度やり直してください。'
    );
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

  const userRepository = createUserRepository(c.env.DB);
  const userId = await userRepository.findUserIdByMicrosoftAccount(
    claims.oid,
    claims.tid
  );
  if (!userId) {
    // upsertUserは呼ばない。このMicrosoftアカウントに対応する
    // RecTimeアカウントが存在しない場合、新規作成はしない。
    return errorResponse(
      c,
      404,
      'ACCOUNT_NOT_FOUND',
      'このMicrosoftアカウントに対応するアカウントが見つかりません。'
    );
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
