import { base64URLtoBytes } from './base64url';
import { createClientAssertion } from './jwt';
import type { Session } from './session';
import type { IdTokenClaims } from './verifyIdToken';
import {
  type AppContext,
  type AppUser,
  type MicrosoftTokenResponse,
  BASE64_URL_PATTERN,
  MICROSOFT_SCOPES,
  ACCOUNT_PHOTO_PATH,
} from './types';

export function errorResponse(
  c: AppContext,
  status: 400 | 401 | 404 | 500,
  code: string,
  message: string
): Response {
  return c.json({ error: { code, message } }, status);
}

export function getClientType(c: AppContext): 'web' | 'mobile' | null {
  const value = c.req.header('X-Client-Type') ?? 'web';
  if (value === 'web' || value === 'mobile') return value;
  return null;
}

export function getNumberEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function shouldUseSecureCookie(c: AppContext): boolean {
  try {
    return new URL(c.env.MICROSOFT_REDIRECT_URI).protocol === 'https:';
  } catch {
    return true;
  }
}

export function isValidBase64Url(value: string): boolean {
  return BASE64_URL_PATTERN.test(value);
}

export function hasMinimumDecodedBytes(
  value: string,
  byteLength: number
): boolean {
  try {
    return base64URLtoBytes(value).byteLength >= byteLength;
  } catch {
    return false;
  }
}

export function getBearerToken(c: AppContext): string | null {
  const authorization = c.req.header('Authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  return match?.[1] ?? null;
}

export function buildMicrosoftUid(
  claims: Pick<IdTokenClaims, 'tid' | 'oid'>
): string {
  return `${claims.tid}:${claims.oid}`;
}

export function buildMicrosoftAuthorizeUrl(
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

export async function exchangeMicrosoftToken(
  c: AppContext,
  params: Record<string, string>,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResponse | null> {
  const body = new URLSearchParams({
    client_id: c.env.MICROSOFT_CLIENT_ID,
    ...params,
  });
  if (options?.includeClientAssertion !== false) {
    const assertion = await createClientAssertion(
      c.env.MICROSOFT_CLIENT_ID,
      c.env.MICROSOFT_TENANT,
      c.env.MICROSOFT_CLIENT_PRIVATE_KEY,
      c.env.MICROSOFT_CERT_THUMBPRINT
    );
    body.set('client_assertion', assertion);
    body.set(
      'client_assertion_type',
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    );
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${c.env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
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

export function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
}

export async function saveSession(
  c: AppContext,
  sessionId: string,
  session: Session
): Promise<void> {
  await c.env.AUTH_KV.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: getSessionTtlSeconds(session.expires_at),
  });
}

export async function refreshMicrosoftAccessToken(
  c: AppContext,
  refreshToken: string,
  options?: { includeClientAssertion?: boolean }
): Promise<MicrosoftTokenResponse | null> {
  return exchangeMicrosoftToken(
    c,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPES,
    },
    options
  );
}

export async function upsertUser(
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
    .first<{ users_id: string }>();

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
        'INSERT INTO users (users_id, display_name, uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(userId, displayName, uid, now, now),
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

export function userResponse(user: {
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
