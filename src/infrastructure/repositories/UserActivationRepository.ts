import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import type { IUserActivationRepository } from '../../domain/interfaces/repositories/IUserActivationRepository';
import * as schema from '../database/schema';
import { users } from '../database/schema';

export function createUserActivationRepository(
  db: D1Database
): IUserActivationRepository {
  const orm = drizzle(db, { schema });

  return {
    async isActive(userId: number): Promise<boolean> {
      // 本人によるアカウント削除(users.deletion_status, #265)は
      // is_live_activeとは独立した軸のため、ここでは条件に含めていない。
      // 削除済みユーザーのトークンも遮断する場合は、この where に
      // eq(users.deletionStatus, 'active') を追加する。
      const row = await orm
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isLiveActive, 1)))
        .get();

      return Boolean(row);
    },
  };
}
