import { base64URLtoBytes, base64URLtoString, toBase64URL } from './base64url';

async function importHmacKey(
  secret: string,
  usages: ('sign' | 'verify')[]
): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error('MISCONFIGURED_JWT_SECRET');
  }

  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

export interface MobileJwtClaims {
  sub: string;
  oid: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
  client_type: 'mobile';
  iat: number;
  exp: number;
}

export async function signMobileJwt(
  payload: Omit<MobileJwtClaims, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims: MobileJwtClaims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const data = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );

  return `${data}.${toBase64URL(new Uint8Array(signature))}`;
}

export async function verifyMobileJwt(
  token: string,
  secret: string
): Promise<MobileJwtClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('INVALID_TOKEN');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64URLtoString(headerB64)) as {
    alg?: string;
    typ?: string;
  };
  if (header.alg !== 'HS256') throw new Error('INVALID_TOKEN');

  const data = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret, ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64URLtoBytes(signatureB64),
    new TextEncoder().encode(data)
  );
  if (!valid) throw new Error('INVALID_TOKEN');

  const claims = JSON.parse(base64URLtoString(payloadB64)) as MobileJwtClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.client_type !== 'mobile') throw new Error('INVALID_TOKEN');
  if (claims.exp <= now) throw new Error('SESSION_EXPIRED');

  return claims;
}
