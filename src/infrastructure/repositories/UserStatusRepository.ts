import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, sql } from 'drizzle-orm';
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

      // 退会済みのUserは稼働状態を動かさない。有効化を通すと、本人はログイン
      // できないのに通知の宛先には入る状態になってしまう。
      const conditions = [
        eq(users.id, userId),
        eq(users.deletionStatus, 'active'),
      ];

      if (!isLiveActive) {
        // 「他に稼働中のstaffが存在する場合だけ」無効化する条件付き更新。
        // 確認と更新が1文になるため、同時に2件走っても0人にならない。
        conditions.push(sql`EXISTS (
          SELECT 1 FROM staffs s
          JOIN users u ON u.user_id = s.user_id
          WHERE s.user_id != ${userId}
            AND u.is_live_active = 1
            AND u.deletion_status = 'active'
        )`);
      }

      // is_live_active は DB では integer(0/1)、API境界では boolean として扱う。
      // 変換はこのRepository（システム境界）で閉じる。
      const updated = await orm
        .update(users)
        .set({ isLiveActive: isLiveActive ? 1 : 0, updatedAt: now })
        .where(and(...conditions))
        .returning({ id: users.id, isLiveActive: users.isLiveActive })
        .get();

      if (!updated) return null;
      return {
        user_id: updated.id,
        is_live_active: Boolean(updated.isLiveActive),
      };
    },

    async existsActiveUser(userId) {
      const found = await orm
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.deletionStatus, 'active')))
        .get();

      return Boolean(found);
    },
  };
}
