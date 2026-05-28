function toBase64URL(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function utf8BytesToString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const first = bytes[i];
    let codePoint = first;

    if (first >= 0xf0) {
      codePoint =
        ((first & 0x07) << 18) |
        ((bytes[++i] & 0x3f) << 12) |
        ((bytes[++i] & 0x3f) << 6) |
        (bytes[++i] & 0x3f);
    } else if (first >= 0xe0) {
      codePoint =
        ((first & 0x0f) << 12) |
        ((bytes[++i] & 0x3f) << 6) |
        (bytes[++i] & 0x3f);
    } else if (first >= 0xc0) {
      codePoint = ((first & 0x1f) << 6) | (bytes[++i] & 0x3f);
    }

    result += String.fromCodePoint(codePoint);
  }
  return result;
}

function base64URLtoString(value: string): string {
  return utf8BytesToString(base64URLtoBytes(value));
}

function base64URLtoBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(
  secret: string,
  usages: ('sign' | 'verify')[]
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
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
