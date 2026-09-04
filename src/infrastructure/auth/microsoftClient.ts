import { createClientAssertion } from './jwt';
import type { MicrosoftTokenResponse } from '../../domain/auth/types';
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

export async function exchangeMicrosoftToken(
  clientId: string,
  tenant: string,
  privateKeyPem: string,
  thumbprint: string,
  params: Record<string, string>,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResponse | null> {
  const body = new URLSearchParams({ client_id: clientId, ...params });

  if (options?.includeClientAssertion !== false) {
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
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  const tokenPayload = (await tokenRes
    .json()
    .catch(() => null)) as MicrosoftTokenResponse | null;
  if (!tokenRes.ok) {
    console.warn('[Auth] Microsoft token exchange failed', {
      status: tokenRes.status,
      error: tokenPayload?.error,
      error_description: tokenPayload?.error_description,
    });
    return null;
  }

  return tokenPayload;
}

export async function refreshMicrosoftAccessToken(
  clientId: string,
  tenant: string,
  privateKeyPem: string,
  thumbprint: string,
  refreshToken: string,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResponse | null> {
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
