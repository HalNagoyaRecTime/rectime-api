import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';

const ADMIN_KEY_HEADER = 'x-admin-key';
const BEARER_PREFIX = 'Bearer ';

export const adminAuthMiddleware = createMiddleware<{
  Bindings: Env;
}>(async (c, next) => {
  const expectedKey = c.env.NOTIFICATION_ADMIN_KEY;

  if (!expectedKey) {
    return c.json(
      {
        error: 'Admin authentication is not configured',
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
      },
      503
    );
  }

  const providedKey = getProvidedAdminKey(c.req.raw.headers);

  if (!providedKey) {
    return c.json(
      { error: 'Admin authentication is required', code: 'UNAUTHORIZED' },
      401
    );
  }

  if (!(await timingSafeEqual(providedKey, expectedKey))) {
    return c.json(
      { error: 'Invalid admin authentication', code: 'FORBIDDEN' },
      403
    );
  }

  await next();
});

function getProvidedAdminKey(headers: {
  get: (name: string) => string | null;
}): string | null {
  const authorization = headers.get('authorization');

  if (authorization?.startsWith(BEARER_PREFIX)) {
    return authorization.slice(BEARER_PREFIX.length).trim() || null;
  }

  return headers.get(ADMIN_KEY_HEADER)?.trim() || null;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [aHash, bHash] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;

  for (let i = 0; i < aHash.length; i += 1) {
    diff |= aHash[i] ^ bHash[i];
  }

  return diff === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(digest);
}
