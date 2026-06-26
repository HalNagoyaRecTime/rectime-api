import type { KVNamespace } from '@cloudflare/workers-types';

export interface Session {
  user_id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
  ms_refresh_token?: string;
  expires_at: string;
}

export async function createSession(
  kv: KVNamespace,
  data: Omit<Session, 'expires_at'>,
  ttlSeconds: number
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const session: Session = {
    ...data,
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
  await kv.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });
  return sessionId;
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<Session | null> {
  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) return null;

  const session = JSON.parse(raw) as Session;
  if (new Date(session.expires_at) < new Date()) return null;

  return session;
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(`session:${sessionId}`);
}

export function getSessionIdFromCookie(
  cookieHeader: string | null
): string | null {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)session=([^;]+)/.exec(cookieHeader);
  return match?.[1] ?? null;
}

export function buildSessionCookie(
  sessionId: string,
  maxAge: number,
  secure: boolean
): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `session=${sessionId}; HttpOnly${secureAttribute}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `session=; HttpOnly${secureAttribute}; SameSite=Lax; Path=/; Max-Age=0`;
}
