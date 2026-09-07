import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { staffs, users } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import { StaffEntity } from '../../domain/entities/Staff';
import { IStaffRepository } from '../../domain/interfaces/repositories/IStaffRepository';

type StaffJoinRow = {
  staffs: typeof staffs.$inferSelect;
  users: typeof users.$inferSelect;
};

function toEntity(row: StaffJoinRow): StaffEntity {
  return {
    staff_id: row.staffs.id,
    user_id: row.users.id,
    user_name: row.users.userName,
  };
}

export function createStaffRepository(db: D1Database): IStaffRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<StaffEntity | null> {
      const result = await orm
        .select()
        .from(staffs)
        .innerJoin(users, eq(staffs.userId, users.id))
        .where(eq(staffs.id, id))
        .get();

      return result ? toEntity(result) : null;
    },

    async findAll(): Promise<StaffEntity[]> {
      const results = await orm
        .select()
        .from(staffs)
        .innerJoin(users, eq(staffs.userId, users.id))
        .all();

      return results.map(toEntity);
    },

    async deleteByUserId(userId: number): Promise<boolean> {
      const result = await orm
        .delete(staffs)
        .where(eq(staffs.userId, userId))
        .run();
      return result.meta.changes > 0;
    },

    async addByUserId(userId: number): Promise<void> {
      // staffs.user_id にUNIQUE制約があるため、衝突を無視するだけで
      // 「すでにstaffなら何もしない」が成立する。存在確認と挿入を別々の
      // 問い合わせに分けると、同時に2回実行されたときに片方が落ちる。
      await orm
        .insert(staffs)
        .values({ userId })
        .onConflictDoNothing({ target: staffs.userId })
        .run();
    },

    async deleteByUserIdUnlessLastActiveStaff(
      userId: number
    ): Promise<boolean> {
      // 「自分以外に有効なstaffが存在する場合だけ」削除する条件付きの1文。
      // 件数を数えてから削除する2ステップにすると、2人が同時に互いを解除
      // したときに両方が「まだ2人いる」と判断でき、0人になりうる。
      const result = await orm
        .delete(staffs)
        .where(
          and(
            eq(staffs.userId, userId),
            sql`EXISTS (
              SELECT 1 FROM staffs s
              JOIN users u ON u.user_id = s.user_id
              WHERE s.user_id != ${userId}
                AND u.is_live_active = 1
                AND u.deletion_status = 'active'
            )`
          )
        )
        .run();
      return result.meta.changes > 0;
    },

    async existsStaff(userId: number): Promise<boolean> {
      const found = await orm
        .select({ id: staffs.id })
        .from(staffs)
        .where(eq(staffs.userId, userId))
        .get();

      return Boolean(found);
    },

    async existsActiveUser(userId: number): Promise<boolean> {
      const found = await orm
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.deletionStatus, 'active')))
        .get();

      return Boolean(found);
    },
  };
}
