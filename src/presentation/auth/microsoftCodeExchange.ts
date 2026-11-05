import type {
  ClientType,
  MicrosoftTokenResponse,
  PkceEntry,
  PkcePurpose,
} from '../../domain/auth/types';
import type { IdTokenClaims } from '../../infrastructure/auth/verifyIdToken';
import { verifyIdToken } from '../../infrastructure/auth/verifyIdToken';
import { AuthErrors } from '../errors/authErrors';
import { errorResponse } from '../errors/errorResponse';
import { microsoftTokenError } from '../errors/microsoftTokenError';
import {
  type AppContext,
  buildWebRedirectUri,
  exchangeMicrosoftToken,
  getClientType,
  isValidBase64Url,
} from './helpers';

type ExchangedTokens<R extends boolean> = MicrosoftTokenResponse & {
  id_token: string;
} & (R extends true ? { refresh_token: string } : unknown);

export type MicrosoftCodeExchangeResult<R extends boolean> =
  | {
      ok: true;
      clientType: ClientType;
      pkce: PkceEntry;
      tokens: ExchangedTokens<R>;
      claims: IdTokenClaims;
    }
  | { ok: false; response: Response };

// authorization codeの交換とid_token検証までを行う。
// 失敗時はそのまま返せるエラーResponseを返す。
// stateは検証の途中で消費されるため、失敗時も再利用できない。
export async function exchangeMicrosoftAuthorizationCode<R extends boolean>(
  c: AppContext,
  options: {
    allowedClientTypes: readonly ClientType[];
    purpose: PkcePurpose;
    requireRefreshToken: R;
  }
): Promise<MicrosoftCodeExchangeResult<R>> {
  const clientType = getClientType(c);
  if (!clientType || !options.allowedClientTypes.includes(clientType)) {
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_CLIENT_TYPE),
    };
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
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_REQUEST),
    };
  }

  if (
    clientType === 'mobile' &&
    (typeof body.code_verifier !== 'string' ||
      body.code_verifier.length < 43 ||
      body.code_verifier.length > 128 ||
      !isValidBase64Url(body.code_verifier))
  ) {
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_REQUEST),
    };
  }

  const pkce = await c.get('container').authStateRepository.consume(body.state);
  if (!pkce) {
    return { ok: false, response: errorResponse(c, AuthErrors.STATE_MISMATCH) };
  }

  if (pkce.client_type !== clientType) {
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_STATE_CLIENT_TYPE),
    };
  }

  if (pkce.purpose !== options.purpose) {
    // 別の用途で発行されたstateが紛れ込んだ場合、
    // 想定外の処理に進まないよう拒否する。
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_STATE_PURPOSE),
    };
  }

  const codeVerifier =
    clientType === 'mobile'
      ? (body.code_verifier as string)
      : pkce.code_verifier;

  if (!codeVerifier) {
    // state 自体は見つかっているが code_verifier だけが欠けているケース
    // （webでpkceエントリにcode_verifierが保存されていない等）。
    // stateの不一致・期限切れ（STATE_MISMATCH）とは原因が異なるため区別する。
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.CODE_VERIFIER_MISSING),
    };
  }

  const result = await exchangeMicrosoftToken(
    c,
    {
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri:
        clientType === 'mobile'
          ? (pkce.desktop_redirect_uri ?? c.env.MICROSOFT_MOBILE_REDIRECT_URI)
          : buildWebRedirectUri(c),
      code_verifier: codeVerifier,
    },
    { includeClientAssertion: clientType === 'web' }
  );

  if (!result.ok) {
    return {
      ok: false,
      response: errorResponse(
        c,
        microsoftTokenError(
          result,
          AuthErrors.TOKEN_EXCHANGE_FAILED,
          AuthErrors.AUTH_PROVIDER_UNAVAILABLE
        )
      ),
    };
  }
  const tokens = result.tokens;
  if (
    !tokens.id_token ||
    (options.requireRefreshToken && !tokens.refresh_token)
  ) {
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.AUTH_PROVIDER_UNAVAILABLE),
    };
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
    return {
      ok: false,
      response: errorResponse(c, AuthErrors.INVALID_ID_TOKEN),
    };
  }

  return {
    ok: true,
    clientType,
    pkce,
    // id_token・refresh_tokenの有無は上で検査済み。
    tokens: tokens as ExchangedTokens<R>,
    claims,
  };
}
