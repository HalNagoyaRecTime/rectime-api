import type { D1Database } from '@cloudflare/workers-types';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { RefreshSession } from '../../domain/auth/types';
import type { IRefreshSessionRepository } from '../../domain/interfaces/repositories/IRefreshSessionRepository';
import * as schema from '../database/schema';
import { refresh_sessions } from '../database/schema';

function toRefreshSession(
  row: typeof refresh_sessions.$inferSelect
): RefreshSession {
  return {
    refresh_token_id: row.refreshTokenId,
    user_id: String(row.userId),
    oid: row.oid,
    tid: row.tid,
    sub: row.sub,
    email: row.email,
    display_name: row.displayName,
    avatar_updated_at: row.avatarUpdatedAt,
    client_type: row.clientType,
    ms_refresh_token: row.msRefreshToken,
  };
}

function expiresAt(ttlSec: number): string {
  return new Date(Date.now() + ttlSec * 1000).toISOString();
}

function toRow(
  session: RefreshSession,
  ttlSec: number
): typeof refresh_sessions.$inferInsert {
  const now = new Date().toISOString();
  return {
    refreshTokenId: session.refresh_token_id,
    userId: Number(session.user_id),
    clientType: session.client_type,
    oid: session.oid,
    tid: session.tid,
    sub: session.sub,
    email: session.email,
    displayName: session.display_name,
    avatarUpdatedAt: session.avatar_updated_at,
    msRefreshToken: session.ms_refresh_token,
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAt(ttlSec),
  };
}

export function createRefreshSessionRepository(
  db: D1Database
): IRefreshSessionRepository {
  const orm = drizzle(db, { schema });
  const notExpired = () =>
    gt(refresh_sessions.expiresAt, new Date().toISOString());

  async function findLatestByUserId(userId: string) {
    const row = await orm
      .select()
      .from(refresh_sessions)
      .where(and(eq(refresh_sessions.userId, Number(userId)), notExpired()))
      .orderBy(desc(refresh_sessions.updatedAt))
      .limit(1)
      .get();
    return row ? toRefreshSession(row) : null;
  }

  return {
    async create(session, ttlSec) {
      await orm.insert(refresh_sessions).values(toRow(session, ttlSec));
    },

    async findById(refreshTokenId) {
      const row = await orm
        .select()
        .from(refresh_sessions)
        .where(
          and(eq(refresh_sessions.refreshTokenId, refreshTokenId), notExpired())
        )
        .get();
      return row ? toRefreshSession(row) : null;
    },

    findLatestByUserId,

    // 同じIDで同時に更新されても両方を成功させるため、読み取った内容から新しい行を作る。
    async rotate(session, nextRefreshTokenId, msRefreshToken, ttlSec) {
      await orm.batch([
        orm.insert(refresh_sessions).values(
          toRow(
            {
              ...session,
              refresh_token_id: nextRefreshTokenId,
              ms_refresh_token: msRefreshToken,
            },
            ttlSec
          )
        ),
        orm
          .delete(refresh_sessions)
          .where(eq(refresh_sessions.refreshTokenId, session.refresh_token_id)),
      ]);
    },

    async update(refreshTokenId, changes, ttlSec) {
      await orm
        .update(refresh_sessions)
        .set({
          ...(changes.ms_refresh_token !== undefined
            ? { msRefreshToken: changes.ms_refresh_token }
            : {}),
          ...(changes.avatar_updated_at !== undefined
            ? { avatarUpdatedAt: changes.avatar_updated_at }
            : {}),
          expiresAt: expiresAt(ttlSec),
        })
        .where(eq(refresh_sessions.refreshTokenId, refreshTokenId));
    },

    async cleanupForUser(userId, refreshTokenId) {
      const targetId =
        refreshTokenId ?? (await findLatestByUserId(userId))?.refresh_token_id;
      if (targetId === undefined) return;

      await orm
        .delete(refresh_sessions)
        .where(
          and(
            eq(refresh_sessions.refreshTokenId, targetId),
            eq(refresh_sessions.userId, Number(userId))
          )
        );
    },

    async deleteByUserId(userId) {
      await orm
        .delete(refresh_sessions)
        .where(eq(refresh_sessions.userId, Number(userId)));
    },

    async deleteExpired() {
      await orm
        .delete(refresh_sessions)
        .where(lte(refresh_sessions.expiresAt, new Date().toISOString()));
    },
  };
}
