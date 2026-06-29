import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { AppUser, Session } from '../../domain/auth/types';
import { ACCOUNT_PHOTO_PATH } from '../../domain/auth/types';
import type { IdTokenClaims } from '../../infrastructure/auth/verifyIdToken';

export function buildMicrosoftUid(
  claims: Pick<IdTokenClaims, 'tid' | 'oid'>
): string {
  return `${claims.tid}:${claims.oid}`;
}

export function getSessionTtlSeconds(sessionExpiresAt: string): number {
  const expiresAt = new Date(sessionExpiresAt).getTime();
  const ttl = Math.floor((expiresAt - Date.now()) / 1000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
}

export async function saveSession(
  kv: KVNamespace,
  sessionId: string,
  session: Session
): Promise<void> {
  await kv.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: getSessionTtlSeconds(session.expires_at),
  });
}

export async function upsertUser(
  db: D1Database,
  claims: IdTokenClaims
): Promise<AppUser> {
  const email = claims.preferred_username ?? claims.email ?? '';
  const displayName = claims.name ?? email;
  const uid = buildMicrosoftUid(claims);
  const now = new Date().toISOString();

  const existing = await db
    .prepare(
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
    await db.batch([
      db
        .prepare(
          'UPDATE users SET display_name = ?, uid = ?, updated_at = ? WHERE users_id = ?'
        )
        .bind(displayName, uid, now, userId),
      db
        .prepare(
          'UPDATE microsoft_account_links SET oid = ?, tid = ?, sub = ?, updated_at = ? WHERE users_id = ?'
        )
        .bind(claims.oid, claims.tid, claims.sub, now, userId),
    ]);
  } else {
    userId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          'INSERT INTO users (users_id, display_name, uid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(userId, displayName, uid, now, now),
      db
        .prepare(
          'INSERT INTO microsoft_account_links (microsoft_account_link_id, users_id, oid, tid, sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(linkId, userId, claims.oid, claims.tid, claims.sub, now, now),
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
