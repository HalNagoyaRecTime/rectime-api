import type { KVNamespace } from '@cloudflare/workers-types';
import { base64URLtoBytes, base64URLtoString } from './base64url';

interface JWK {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

export interface IdTokenClaims {
  sub: string;
  oid: string;
  tid: string;
  preferred_username?: string;
  email?: string;
  name: string;
  nonce: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
}

const JWKS_URI = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';
const JWKS_CACHE_KEY = 'jwks_cache';
const JWKS_CACHE_TTL = 3600;

async function fetchJWKS(kv: KVNamespace): Promise<JWK[]> {
  const cached = (await kv.get(JWKS_CACHE_KEY, 'json')) as {
    keys: JWK[];
  } | null;
  if (Array.isArray(cached?.keys)) return cached.keys;

  const res = await fetch(JWKS_URI);
  if (!res.ok) {
    throw new Error('JWKS_FETCH_FAILED');
  }

  const data = (await res.json()) as { keys: JWK[] };
  if (!Array.isArray(data.keys)) {
    throw new Error('JWKS_FETCH_FAILED');
  }

  await kv.put(JWKS_CACHE_KEY, JSON.stringify(data), {
    expirationTtl: JWKS_CACHE_TTL,
  });
  return data.keys;
}

async function getPublicKey(kv: KVNamespace, kid: string): Promise<CryptoKey> {
  let keys = await fetchJWKS(kv);
  let jwk = keys.find(k => k.kid === kid);

  if (!jwk) {
    await kv.delete(JWKS_CACHE_KEY);
    keys = await fetchJWKS(kv);
    jwk = keys.find(k => k.kid === kid);
  }

  if (!jwk) throw new Error('INVALID_ID_TOKEN');

  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyIdToken(
  idToken: string,
  kv: KVNamespace,
  clientId: string,
  nonce: string,
  microsoftTenant: string,
  allowedMicrosoftTenants?: string
): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('INVALID_ID_TOKEN');

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64URLtoString(headerB64)) as {
    alg: string;
    kid: string;
  };
  if (header.alg !== 'RS256') throw new Error('INVALID_ID_TOKEN');

  const publicKey = await getPublicKey(kv, header.kid);

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64URLtoBytes(signatureB64);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    data
  );
  if (!valid) throw new Error('INVALID_ID_TOKEN');

  const payload = JSON.parse(base64URLtoString(payloadB64)) as IdTokenClaims;

  const now = Math.floor(Date.now() / 1000);
  const clockSkew = 300;

  if (typeof payload.exp !== 'number' || payload.exp < now - clockSkew) throw new Error('INVALID_ID_TOKEN');
  if (typeof payload.iat !== 'number' || payload.iat > now + clockSkew) throw new Error('INVALID_ID_TOKEN');
  if (payload.aud !== clientId) throw new Error('INVALID_ID_TOKEN');
  if (typeof payload.tid !== 'string' || !payload.tid) throw new Error('INVALID_ID_TOKEN');
  const allowedTenants = (allowedMicrosoftTenants ?? '')
    .split(',')
    .map(tenant => tenant.trim())
    .filter(Boolean);
  const normalizedMicrosoftTenant = (microsoftTenant ?? '').trim();
  const tenantAllowsAny =
    normalizedMicrosoftTenant === '' ||
    normalizedMicrosoftTenant === 'common' ||
    normalizedMicrosoftTenant === 'organizations';
  // テナントをコンフィグ値で先に検証し、そのテナントに対して発行者URLを照合する
  // payload.tid を先に使うと発行者チェックが循環してしまうため順序を入れ替えた
  if (allowedTenants.length > 0) {
    if (!allowedTenants.includes(payload.tid)) {
      throw new Error('INVALID_ID_TOKEN');
    }
    if (
      payload.iss !== `https://login.microsoftonline.com/${payload.tid}/v2.0`
    ) {
      throw new Error('INVALID_ID_TOKEN');
    }
  } else if (tenantAllowsAny) {
    // common/organizations エンドポイント使用時は ALLOWED_MICROSOFT_TENANTS の設定が必須。
    // iss/tid はトークン内で常に自己整合するため issuer のみの検証ではテナント制限にならない。
    throw new Error('INVALID_ID_TOKEN');
  } else {
    if (payload.tid !== normalizedMicrosoftTenant) {
      throw new Error('INVALID_ID_TOKEN');
    }
    if (
      payload.iss !==
      `https://login.microsoftonline.com/${normalizedMicrosoftTenant}/v2.0`
    ) {
      throw new Error('INVALID_ID_TOKEN');
    }
  }
  if (payload.nonce !== nonce) throw new Error('INVALID_ID_TOKEN');

  return payload;
}
