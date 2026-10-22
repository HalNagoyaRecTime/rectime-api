import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { IUserStatusRepository } from '../../domain/interfaces/repositories/IUserStatusRepository';
import * as schema from '../database/schema';
import { class_rooms, teachers, users } from '../database/schema';

export function createUserStatusRepository(
  db: D1Database
): IUserStatusRepository {
  const orm = drizzle(db, { schema });

  return {
    async isActive(userId) {
      const row = await orm
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.isLiveActive, 1),
            eq(users.deletionStatus, 'active')
          )
        )
        .get();

      return Boolean(row);
    },

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

      // 教室の取得結果は、担任が稼働中かどうかで担任の有無が変わる（停止中の教員は
      // 担任として返さない）。稼働状態が実際に変わるときは、その教員が担任のクラスの
      // 版番号も進め、取得後に稼働状態が変わっていた教室の更新を検出できるようにする。
      // 同じ状態への更新（すでに有効な教員を有効にする、など）では進めない。教室の
      // 編集画面が、実際には何も変わっていないのに409になるのを避けるため。
      // 「変わる」ことと「users の更新が成功する」ことは、users の更新と同じ条件に
      // 「現在の値が新しい値と異なる」を足した EXISTS で判定する。users の更新より
      // 前に置く（更新後は変わったかどうか判別できないため）。
      //
      // is_live_active は DB では integer(0/1)、API境界では boolean として扱う。
      // 変換はこのRepository（システム境界）で閉じる。
      const nextLiveActive = isLiveActive ? 1 : 0;
      const [, updatedRows] = await orm.batch([
        orm
          .update(class_rooms)
          .set({
            updatedAt: now,
            lockVersion: sql`${class_rooms.lockVersion} + 1`,
          })
          .where(
            and(
              inArray(
                class_rooms.teacherId,
                orm
                  .select({ id: teachers.id })
                  .from(teachers)
                  .where(eq(teachers.userId, userId))
              ),
              sql`EXISTS (
                SELECT 1 FROM ${users}
                WHERE ${and(...conditions, ne(users.isLiveActive, nextLiveActive))}
              )`
            )
          ),
        orm
          .update(users)
          .set({ isLiveActive: nextLiveActive, updatedAt: now })
          .where(and(...conditions))
          .returning({ id: users.id, isLiveActive: users.isLiveActive }),
      ]);
      const updated = updatedRows[0];

      if (!updated) return null;
      return {
        user_id: updated.id,
        is_live_active: Boolean(updated.isLiveActive),
      };
    },

    // ここでの active は deletion_status のこと。稼働状態(is_live_active)は
    // 見ない。無効化済みでもUserとしては残っているため。
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
