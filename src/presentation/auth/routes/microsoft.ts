import { Hono } from 'hono';
import type { Env as Bindings } from '../../../lib/env';
import {
  generateRandom,
  generateCodeChallenge,
} from '../../../infrastructure/auth/pkce';
import { signAccessToken } from '../../../infrastructure/auth/jwt';
import {
  getClientType,
  getNumberEnv,
  isValidBase64Url,
  hasMinimumDecodedBytes,
  buildMicrosoftAuthorizeUrl,
  buildWebRedirectUri,
  upsertUser,
} from '../helpers';
import {
  getAllowedFrontendOrigin,
  getStoredFrontendOrigin,
} from '../frontendOrigin';
import {
  type DeletionConfirmationEntry,
  ACCOUNT_PHOTO_PATH,
} from '../../../domain/auth/types';
import type { ContainerVariables } from '../../middleware/diContainer';
import { createUserRepository } from '../../../infrastructure/repositories/UserRepository';
import { AuthErrors } from '../../errors/authErrors';
import { isDesktopRedirectUri } from '../desktopRedirect';
import { exchangeMicrosoftAuthorizationCode } from '../microsoftCodeExchange';
import { resolveCampusFromEmail } from '../../../domain/auth/campus';
import { pickMicrosoftEmailClaim } from '../../../domain/auth/email';
import { CommonErrors } from '../../errors/commonErrors';
import { errorResponse } from '../../errors/errorResponse';

const DELETION_CONFIRMATION_TTL_SEC = 600;
const AUTH_STATE_TTL_SEC = 600;

const microsoft = new Hono<{
  Bindings: Bindings;
  Variables: ContainerVariables;
}>();

// GET /auth/microsoft/login
microsoft.get('/login', async c => {
  const desktopRedirectUri = c.req.header('X-Desktop-Redirect-Uri');
  if (
    desktopRedirectUri !== undefined &&
    (getClientType(c) !== 'mobile' || !isDesktopRedirectUri(desktopRedirectUri))
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }
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

    const created = await c.get('container').authStateRepository.create(
      state,
      {
        nonce,
        client_type: 'mobile',
        purpose: 'login',
        ...(desktopRedirectUri
          ? { desktop_redirect_uri: desktopRedirectUri }
          : {}),
        created_at: new Date().toISOString(),
      },
      AUTH_STATE_TTL_SEC
    );
    if (!created) {
      return errorResponse(c, AuthErrors.STATE_ALREADY_EXISTS);
    }

    return c.json({
      auth_url: buildMicrosoftAuthorizeUrl(
        c,
        desktopRedirectUri ?? c.env.MICROSOFT_MOBILE_REDIRECT_URI,
        state,
        codeChallenge,
        nonce
      ),
    });
  }

  const state = generateRandom(32);
  const codeVerifier = generateRandom(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const frontendOrigin = getAllowedFrontendOrigin(c);

  await c.get('container').authStateRepository.create(
    state,
    {
      code_verifier: codeVerifier,
      nonce,
      client_type: 'web',
      purpose: 'login',
      ...(frontendOrigin ? { frontend_origin: frontendOrigin } : {}),
      created_at: new Date().toISOString(),
    },
    AUTH_STATE_TTL_SEC
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
// PKCE/state発行の仕組みを使うが、stateのpurposeを'account_deletion'にする
// ことで、/delete-token側がupsertUserや一般API用Tokenの発行に進まない
// ようにする。
microsoft.get('/delete-login', async c => {
  const desktopRedirectUri = c.req.header('X-Desktop-Redirect-Uri');
  if (
    desktopRedirectUri !== undefined &&
    (getClientType(c) !== 'mobile' || !isDesktopRedirectUri(desktopRedirectUri))
  ) {
    return errorResponse(c, AuthErrors.INVALID_REQUEST);
  }
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

    const created = await c.get('container').authStateRepository.create(
      state,
      {
        nonce,
        client_type: 'mobile',
        purpose: 'account_deletion',
        ...(desktopRedirectUri
          ? { desktop_redirect_uri: desktopRedirectUri }
          : {}),
        created_at: new Date().toISOString(),
      },
      AUTH_STATE_TTL_SEC
    );
    if (!created) {
      return errorResponse(c, AuthErrors.STATE_ALREADY_EXISTS);
    }

    return c.json({
      // prompt=login で資格情報の再入力を強制する(削除確認フローの目的は
      // 「今操作している本人」の再認証であり、prompt=select_accountのままだと
      // Microsoft側のセッションが残っている場合に無入力で認証が完了し得るため)。
      auth_url: buildMicrosoftAuthorizeUrl(
        c,
        desktopRedirectUri ?? c.env.MICROSOFT_MOBILE_REDIRECT_URI,
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
  const frontendOrigin = getAllowedFrontendOrigin(c);

  await c.get('container').authStateRepository.create(
    state,
    {
      code_verifier: codeVerifier,
      nonce,
      client_type: 'web',
      purpose: 'account_deletion',
      ...(frontendOrigin ? { frontend_origin: frontendOrigin } : {}),
      created_at: new Date().toISOString(),
    },
    AUTH_STATE_TTL_SEC
  );

  // Refererから検証済みoriginをstateに保存し、callbackで同じoriginへ戻す。
  // 取得できない場合はFRONTEND_URLへフォールバックする。
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
  const frontendUrl =
    (await getStoredFrontendOrigin(c, state)) ?? c.env.FRONTEND_URL;

  if (error && state) {
    return c.redirect(
      `${frontendUrl}/auth/callback?error=${encodeURIComponent(error)}&state=${encodeURIComponent(state)}`,
      302
    );
  }

  if (!code || !state) {
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
//   保存済みのものを使うため、ボディでは code/state のみを要求する。
microsoft.post('/token', async c => {
  const exchanged = await exchangeMicrosoftAuthorizationCode(c, {
    allowedClientTypes: ['mobile', 'web'],
    // /delete-login で発行された state がこちらに紛れ込んだ場合、
    // upsertUserや一般API用Tokenの発行に進んでしまうため拒否する。
    purpose: 'login',
    requireRefreshToken: true,
  });
  if (!exchanged.ok) {
    return exchanged.response;
  }
  const { clientType, tokens, claims } = exchanged;

  let user;
  try {
    user = await upsertUser(c, claims);
  } catch (err) {
    if (err instanceof Error && err.message === 'STUDENT_ALREADY_LINKED') {
      return errorResponse(c, AuthErrors.STUDENT_ALREADY_LINKED);
    }
    if (err instanceof Error && err.message === 'TEACHER_ALREADY_LINKED') {
      return errorResponse(c, AuthErrors.TEACHER_ALREADY_LINKED);
    }
    if (err instanceof Error && err.message === 'TEACHER_LINK_CHANGED') {
      return errorResponse(c, AuthErrors.TEACHER_LINK_CHANGED);
    }
    if (err instanceof Error && err.message === 'ACCOUNT_DELETION_PENDING') {
      return errorResponse(c, AuthErrors.ACCOUNT_DELETION_PENDING);
    }
    if (err instanceof Error && err.message === 'USER_DEACTIVATED') {
      return errorResponse(c, AuthErrors.USER_DEACTIVATED);
    }
    throw err;
  }

  if (clientType === 'web') {
    let isStaff: boolean;
    try {
      isStaff = await c
        .get('container')
        .authorizationService.isStaff(Number(user.id));
    } catch {
      return errorResponse(c, {
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'staff権限の確認に失敗しました',
      });
    }
    if (!isStaff) {
      return errorResponse(c, CommonErrors.STAFF_REQUIRED);
    }
  }

  // プロフィール(学生情報・種別・担当クラス)の取得は、生きたMicrosoft
  // リフレッシュトークンを保存する前に、すべて検知したいため、副作用より
  // 先にawaitする。
  const { authProfileService, refreshSessionRepository } = c.get('container');
  const profile = await authProfileService.getProfile(user);

  const refreshTokenId = crypto.randomUUID();
  const refreshTtl = getNumberEnv(c.env.MOBILE_REFRESH_EXPIRES_SEC, 7776000);

  await refreshSessionRepository.create(
    {
      refresh_token_id: refreshTokenId,
      user_id: user.id,
      oid: user.oid,
      tid: user.tid,
      sub: user.sub,
      email: user.email,
      display_name: user.display_name,
      avatar_updated_at: null,
      client_type: clientType,
      ms_refresh_token: tokens.refresh_token,
    },
    refreshTtl
  );

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

  return c.json({
    access_token: accessToken,
    refresh_token_id: refreshTokenId,
    token_type: 'Bearer',
    expires_in: jwtTtl,
    user: profile,
  });
});

// POST /auth/microsoft/resolve-campus
// 名古屋校のWorkerでmobileがログイン後の所属校を判定するために呼ぶ。
// - request: /token(mobile)と同じ { code, state, code_verifier }。
//   X-Client-Type: mobile のみ許可し、stateのpurposeは'login'。
// - response 200: { campus, ms_refresh_token }(Cache-Control: no-store)。
//   id_token・access_tokenは返さない。
// - error: /tokenと同じAuthErrorsを返す(新しいエラーコードは追加しない)。
// - DB書き込みはauth_statesの消費のみ。upsertUser・users・refresh_sessions
//   への書き込みやrectime-apiのToken発行は行わない。
microsoft.post('/resolve-campus', async c => {
  const exchanged = await exchangeMicrosoftAuthorizationCode(c, {
    allowedClientTypes: ['mobile'],
    purpose: 'login',
    requireRefreshToken: true,
  });
  if (!exchanged.ok) {
    return exchanged.response;
  }
  const { tokens, claims } = exchanged;

  const email = pickMicrosoftEmailClaim(claims);

  c.header('Cache-Control', 'no-store');
  return c.json({
    campus: resolveCampusFromEmail(email),
    ms_refresh_token: tokens.refresh_token,
  });
});

// POST /auth/microsoft/delete-token
// アカウント削除確認専用。/token とPKCE検証・Microsoftとのトークン交換・
// id_token検証までは共通だが、ここから先はupsertUser（新規作成・
// Student紐付け・一般API用Tokenの発行）を一切行わない。
// 既存アカウントの照合のみ行い、見つかった場合に一回限り・短期間の
// 削除確認Token（不透明な文字列）を発行する。
microsoft.post('/delete-token', async c => {
  const exchanged = await exchangeMicrosoftAuthorizationCode(c, {
    allowedClientTypes: ['mobile', 'web'],
    // /login で発行された state がこちらに紛れ込んだ場合を拒否する。
    purpose: 'account_deletion',
    // 削除確認ではMicrosoftのrefresh_tokenを保存しないため要求しない。
    requireRefreshToken: false,
  });
  if (!exchanged.ok) {
    return exchanged.response;
  }
  const { claims } = exchanged;

  const userRepository = createUserRepository(c.env.DB);
  const userId = await userRepository.findUserIdByMicrosoftAccount(
    claims.oid,
    claims.tid
  );

  if (!userId) {
    // upsertUserは呼ばない。このMicrosoftアカウントに対応する
    // RecTimeアカウントが存在しない場合、新規作成はしない。
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
