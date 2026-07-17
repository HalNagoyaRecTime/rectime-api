import type { D1Database } from '@cloudflare/workers-types';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import * as schema from '../database/schema';
import { microsoft_account_links, users } from '../database/schema';

export function createUserRepository(db: D1Database): IUserRepository {
  const orm = drizzle(db, { schema });

  return {
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

    async updateUser({ userId, oid, tid, sub, email, displayName }) {
      const now = new Date().toISOString();

      const user = await orm
        .update(users)
        .set({ userName: displayName, updatedAt: now })
        .where(eq(users.id, Number(userId)))
        .returning({ id: users.id })
        .get();

      if (!user) return null;
      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },
  };
}
