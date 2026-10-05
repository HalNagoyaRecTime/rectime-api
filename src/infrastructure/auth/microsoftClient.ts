import { createClientAssertion } from './jwt';
import type {
  MicrosoftTokenResponse,
  MicrosoftTokenResult,
} from '../../domain/auth/types';
import { MICROSOFT_SCOPES } from '../../domain/auth/types';

export const GRAPH_ME_PHOTO_URL =
  'https://graph.microsoft.com/v1.0/me/photo/$value';

export function buildMicrosoftAuthorizeUrl(
  clientId: string,
  tenant: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  nonce: string,
  // 'select_account': 通常ログイン用。Microsoft側にセッションが残っていれば
  // アカウント選択のみで認証が完了し得る。
  // 'login': 削除確認フロー用。既存セッションがあっても資格情報の再入力を
  // 強制し、「今操作している本人」であることを再確認させる。
  prompt: 'select_account' | 'login' = 'select_account'
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: MICROSOFT_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
    response_mode: 'query',
    prompt,
  });

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export const MICROSOFT_TOKEN_TIMEOUT_MS = 10_000;

export async function exchangeMicrosoftToken(
  clientId: string,
  tenant: string,
  privateKeyPem: string,
  thumbprint: string,
  params: Record<string, string>,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MicrosoftTokenResult>(resolve => {
    timer = setTimeout(() => {
      resolve({ ok: false, reason: 'unavailable' });
      controller.abort();
    }, MICROSOFT_TOKEN_TIMEOUT_MS);
  });

  try {
    // 本文の受信や証明書処理も含めて上限を設け、fetchの中断だけに頼らない。
    return await Promise.race([
      requestMicrosoftToken(
        clientId,
        tenant,
        privateKeyPem,
        thumbprint,
        params,
        controller.signal,
        options
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function requestMicrosoftToken(
  clientId: string,
  tenant: string,
  privateKeyPem: string,
  thumbprint: string,
  params: Record<string, string>,
  signal: AbortSignal,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResult> {
  const body = new URLSearchParams({ client_id: clientId, ...params });
  if (options?.includeClientAssertion !== false) {
    try {
      const assertion = await createClientAssertion(
        clientId,
        tenant,
        privateKeyPem,
        thumbprint
      );
      body.set('client_assertion', assertion);
      body.set(
        'client_assertion_type',
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      );
    } catch {
      return { ok: false, reason: 'provider_error' };
    }
  }
  if (signal.aborted) return { ok: false, reason: 'unavailable' };

  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal,
      }
    );
    // HTTP状態を優先し、5xxの本文にinvalid_grantがあっても失効にしない。
    if (response.status === 429 || response.status >= 500) {
      console.warn('[Auth] Microsoftの認証更新を確認できません', {
        status: response.status,
      });
      await response.body?.cancel();
      return { ok: false, reason: 'unavailable' };
    }
    const payload: unknown = await response.json();
    if (!response.ok) {
      console.warn('[Auth] Microsoftとのトークン交換に失敗しました', {
        status: response.status,
      });
      if (
        response.status === 400 &&
        isRecord(payload) &&
        (payload.error === 'invalid_grant' ||
          payload.error === 'interaction_required')
      ) {
        return { ok: false, reason: 'reauthentication_required' };
      }
      return { ok: false, reason: 'provider_error' };
    }
    if (!isTokenPayload(payload)) return { ok: false, reason: 'unavailable' };
    return { ok: true, tokens: payload };
  } catch {
    // 上流の例外本文には秘密情報が含まれ得るため記録しない。
    return { ok: false, reason: 'unavailable' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTokenPayload(value: unknown): value is MicrosoftTokenResponse {
  if (!isRecord(value) || 'error' in value) return false;
  const fields = ['access_token', 'id_token', 'refresh_token'];
  return (
    fields.some(field => field in value) &&
    fields.every(
      field =>
        !(field in value) ||
        (typeof value[field] === 'string' && value[field].trim().length > 0)
    )
  );
}

export async function refreshMicrosoftAccessToken(
  clientId: string,
  tenant: string,
  privateKeyPem: string,
  thumbprint: string,
  refreshToken: string,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResult> {
  return exchangeMicrosoftToken(
    clientId,
    tenant,
    privateKeyPem,
    thumbprint,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPES,
    },
    options
  );
}
