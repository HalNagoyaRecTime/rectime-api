import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { IUserStatusRepository } from '../../domain/interfaces/repositories/IUserStatusRepository';
import * as schema from '../database/schema';
import { users } from '../database/schema';

export function createUserStatusRepository(
  db: D1Database
): IUserStatusRepository {
  const orm = drizzle(db, { schema });

  return {
    async updateLiveActive(userId, isLiveActive) {
      const now = new Date().toISOString();

      // is_live_active は DB では integer(0/1)、API境界では boolean として扱う。
      // 変換はこのRepository（システム境界）で閉じる。
      const updated = await orm
        .update(users)
        .set({ isLiveActive: isLiveActive ? 1 : 0, updatedAt: now })
        .where(eq(users.id, userId))
        .returning({ id: users.id, isLiveActive: users.isLiveActive })
        .get();

      if (!updated) return null;
      return {
        user_id: updated.id,
        is_live_active: Boolean(updated.isLiveActive),
      };
    },
  };
}
