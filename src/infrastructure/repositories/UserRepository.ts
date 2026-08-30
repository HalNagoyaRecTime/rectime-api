import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import * as schema from '../database/schema';
import {
  microsoft_account_links,
  staffs,
  students,
  teachers,
  users,
} from '../database/schema';

export function createUserRepository(db: D1Database): IUserRepository {
  const orm = drizzle(db, { schema });

  return {
    async exists(userId) {
      return Boolean(
        await orm
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .get()
      );
    },
    async isStaff(userId) {
      const row = await orm
        .select({ userId: users.id })
        .from(users)
        .leftJoin(staffs, eq(staffs.userId, users.id))
        .where(and(eq(users.id, userId), sql`${staffs.id} IS NOT NULL`))
        .get();
      return Boolean(row);
    },
    async getUserCategories(userId) {
      const row = await orm
        .select({
          isStudent: sql<number>`CASE WHEN ${students.id} IS NOT NULL THEN 1 ELSE 0 END`,
          isStaff: sql<number>`CASE WHEN ${staffs.id} IS NOT NULL THEN 1 ELSE 0 END`,
          isTeacher: sql<number>`CASE WHEN ${teachers.id} IS NOT NULL THEN 1 ELSE 0 END`,
        })
        .from(users)
        .leftJoin(students, eq(students.userId, users.id))
        .leftJoin(staffs, eq(staffs.userId, users.id))
        .leftJoin(teachers, eq(teachers.userId, users.id))
        .where(eq(users.id, userId))
        .get();

      return {
        is_student: Boolean(row?.isStudent),
        is_staff: Boolean(row?.isStaff),
        is_teacher: Boolean(row?.isTeacher),
      };
    },
    async findUserIdByMicrosoftAccount(oid, tid) {
      const row = await orm
        .select({ userId: users.id })
        .from(microsoft_account_links)
        .innerJoin(users, eq(users.id, microsoft_account_links.userId))
        .where(
          and(
            eq(microsoft_account_links.oid, oid),
            eq(microsoft_account_links.tid, tid)
          )
        )
        .get();
      return row ? String(row.userId) : null;
    },

    async getDeletionStatus(userId) {
      const row = await orm
        .select({ deletionStatus: users.deletionStatus })
        .from(users)
        .where(eq(users.id, Number(userId)))
        .get();
      return row ? row.deletionStatus : null;
    },

    async createUserWithMicrosoftLink({ oid, tid, sub, email, displayName }) {
      const now = new Date().toISOString();

      // users.user_id は自動採番のため、microsoft_account_links の挿入に必要な
      // IDは users への挿入が完了するまで分からない。db.batch() では後続の文が
      // 先行する文の結果を参照できないため、ここでは2段階の挿入にし、
      // 2段目が失敗した場合（oid/tid の同時初回ログインによる競合など）は
      // 直前に作った users 行を手動で取り消して孤立させない。
      // 注意: これは真のトランザクションではないため、以下の残存リスクがある。
      // - 補償のDELETE自体が失敗した場合（一時的なD1障害等）、孤立した
      //   users行が残り得る。ただし findUserIdByMicrosoftAccount は
      //   microsoft_account_links とのINNER JOIN経由でしか users を見ないため、
      //   孤立行がMicrosoftログイン経路に混入することはない
      // - 2つのINSERTの間、当該ユーザーは一瞬「microsoft_account_linksと
      //   紐付いていないusers行」として存在する。将来 users を直接一覧・参照する
      //   機能（管理画面等）を作る際は、この一瞬の不整合ウィンドウに留意すること
      const user = await orm
        .insert(users)
        .values({
          userName: displayName,
          isLiveActive: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id })
        .get();

      if (!user) {
        throw new Error('Failed to create user');
      }

      try {
        await orm
          .insert(microsoft_account_links)
          .values({
            userId: user.id,
            oid,
            tid,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } catch (err) {
        await orm.delete(users).where(eq(users.id, user.id)).run();
        // DrizzleはD1の制約違反を「Failed query」エラーでラップする。
        // 既存の生SQL実装と同じエラーを呼び出し元へ返せるよう、原因を再送出する。
        if (err instanceof Error && err.cause instanceof Error) {
          throw err.cause;
        }
        throw err;
      }

      return {
        id: String(user.id),
        oid,
        tid,
        sub,
        email,
        display_name: displayName,
      };
    },
    //すでに学生登録時にusersにuser_idが存在している場合、microsoft_account_linksをそのuser_idに合わせてinsertする
    async linkMicrosoftAccount({ userId, oid, tid }) {
      const now = new Date().toISOString();

      try {
        // INSERT ... SELECT ... WHERE で「対象userIdがdeletion_status =
        // 'active'であること」をINSERT自体の条件に含める。呼び出し元が
        // 事前にgetDeletionStatusで確認していても、確認からこのINSERTまでの
        // 間にmarkAsDeletedが割り込むと、確認時点ではactiveでも実行時には
        // 既にdeleted/deletion_pendingになっている可能性がある(TOCTOU)。
        // その場合はWHERE句が偽になり0行挿入となるため、
        // ACCOUNT_DELETION_PENDINGとして呼び出し元へ区別して伝える。
        const result = await orm.run(sql`
          INSERT INTO microsoft_account_links (user_id, oid, tid, created_at, updated_at)
          SELECT ${Number(userId)}, ${oid}, ${tid}, ${now}, ${now}
          FROM users
          WHERE user_id = ${Number(userId)} AND deletion_status = 'active'
        `);
        if (result.meta.changes === 0) {
          throw new Error('ACCOUNT_DELETION_PENDING');
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === 'ACCOUNT_DELETION_PENDING'
        ) {
          throw err;
        }
        // DrizzleはD1の制約違反を「Failed query」エラーでラップする。
        // 既存の生SQL実装と同じエラーを呼び出し元へ返せるよう、原因を再送出する。
        if (err instanceof Error && err.cause instanceof Error) {
          throw err.cause;
        }
        throw err;
      }
    },

    async updateUser({ userId, oid, tid, sub, email, displayName }) {
      const now = new Date().toISOString();

      // deletion_status = 'active' をWHERE句自体に含める。呼び出し元で
      // 事前にgetDeletionStatusを確認していても、確認からこのUPDATEまでの
      // 間にmarkAsDeletedが割り込むと、確認時点ではactiveでも実行時には
      // 既にdeleted/deletion_pendingになっている可能性がある(TOCTOU)。
      // 条件をUPDATE自体に含めることで、その場合は0件更新となり
      // 更新されない(＝古いuser_nameのまま)ことを保証する。
      const user = await orm
        .update(users)
        .set({ userName: displayName, updatedAt: now })
        .where(
          and(eq(users.id, Number(userId)), eq(users.deletionStatus, 'active'))
        )
        .returning({ id: users.id })
        .get();

      if (!user) return null;
      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },

    async markAsDeleted(userId) {
      const existing = await orm
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, Number(userId)))
        .get();
      if (!existing) return false;

      const now = new Date().toISOString();

      // deleteを先に実行する。update(deletionStatus: 'deleted')を先に
      // 成功させてしまうと、後続のlinks削除が失敗した場合に「本人には
      // 削除完了と見えるが、Microsoftアカウントとの紐付けは残っている」
      // という状態になり得る。順序を入れ替えても、links削除の後で
      // updateが失敗する部分失敗は起こり得るが、その場合は
      // deletionStatusがまだ'active'のまま(＝本人にも削除未完了と見える)
      // なので、同じuserIdでmarkAsDeletedを再実行すれば解消できる。
      await orm
        .delete(microsoft_account_links)
        .where(eq(microsoft_account_links.userId, Number(userId)))
        .run();

      await orm
        .update(users)
        .set({
          deletionStatus: 'deleted',
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, Number(userId)))
        .run();

      return true;
    },
  };
}
