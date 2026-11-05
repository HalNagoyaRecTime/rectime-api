import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, gt, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { PkceEntry } from '../../domain/auth/types';
import type { IAuthStateRepository } from '../../domain/interfaces/repositories/IAuthStateRepository';
import * as schema from '../database/schema';
import { auth_states } from '../database/schema';

function toPkceEntry(row: typeof auth_states.$inferSelect): PkceEntry {
  return {
    nonce: row.nonce,
    client_type: row.clientType,
    purpose: row.purpose,
    created_at: row.createdAt,
    ...(row.codeVerifier !== null ? { code_verifier: row.codeVerifier } : {}),
    ...(row.desktopRedirectUri !== null
      ? { desktop_redirect_uri: row.desktopRedirectUri }
      : {}),
    ...(row.frontendOrigin !== null
      ? { frontend_origin: row.frontendOrigin }
      : {}),
  };
}

export function createAuthStateRepository(
  db: D1Database
): IAuthStateRepository {
  const orm = drizzle(db, { schema });

  return {
    async create(state, entry, ttlSec) {
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const [, inserted] = await orm.batch([
        orm
          .delete(auth_states)
          .where(
            and(
              eq(auth_states.state, state),
              lte(auth_states.expiresAt, nowIso)
            )
          ),
        orm
          .insert(auth_states)
          .values({
            state,
            clientType: entry.client_type,
            purpose: entry.purpose,
            nonce: entry.nonce,
            codeVerifier: entry.code_verifier ?? null,
            desktopRedirectUri: entry.desktop_redirect_uri ?? null,
            frontendOrigin: entry.frontend_origin ?? null,
            createdAt: entry.created_at,
            expiresAt: new Date(now + ttlSec * 1000).toISOString(),
          })
          .onConflictDoNothing()
          .returning({ state: auth_states.state }),
      ]);
      return inserted.length > 0;
    },

    async find(state) {
      const row = await orm
        .select()
        .from(auth_states)
        .where(
          and(
            eq(auth_states.state, state),
            gt(auth_states.expiresAt, new Date().toISOString())
          )
        )
        .get();
      return row ? toPkceEntry(row) : null;
    },

    async consume(state) {
      const [row] = await orm
        .delete(auth_states)
        .where(eq(auth_states.state, state))
        .returning();
      if (!row || row.expiresAt <= new Date().toISOString()) return null;
      return toPkceEntry(row);
    },

    async deleteExpired() {
      await orm
        .delete(auth_states)
        .where(lte(auth_states.expiresAt, new Date().toISOString()));
    },
  };
}
