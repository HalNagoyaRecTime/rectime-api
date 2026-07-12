import type { D1Database } from '@cloudflare/workers-types';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';

export function createUserRepository(db: D1Database): IUserRepository {
  return {
    async findUserIdByMicrosoftAccount(oid, tid) {
      const row = await db
        .prepare(
          `SELECT u.user_id
             FROM microsoft_account_links m
             INNER JOIN users u ON u.user_id = m.user_id
            WHERE m.oid = ? AND m.tid = ?`
        )
        .bind(oid, tid)
        .first<{ user_id: number }>();
      return row ? String(row.user_id) : null;
    },

    async createUserWithMicrosoftLink({ oid, tid, sub, email, displayName }) {
      const now = new Date().toISOString();

      // users.user_id は自動採番のため、microsoft_account_links の挿入に必要な
      // IDは users への挿入が完了するまで分からない。db.batch() では後続の文が
      // 先行する文の結果を参照できないため、ここでは2段階の挿入にし、
      // 2段目が失敗した場合（oid/tid の同時初回ログインによる競合など）は
      // 直前に作った users 行を手動で取り消して孤立させない。
      const user = await db
        .prepare(
          'INSERT INTO users (user_name, is_live_active, created_at, updated_at) VALUES (?, 1, ?, ?) RETURNING user_id'
        )
        .bind(displayName, now, now)
        .first<{ user_id: number }>();

      if (!user) {
        throw new Error('Failed to create user');
      }

      try {
        await db
          .prepare(
            'INSERT INTO microsoft_account_links (user_id, oid, tid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(user.user_id, oid, tid, now, now)
          .run();
      } catch (err) {
        await db
          .prepare('DELETE FROM users WHERE user_id = ?')
          .bind(user.user_id)
          .run();
        throw err;
      }

      return {
        id: String(user.user_id),
        oid,
        tid,
        sub,
        email,
        display_name: displayName,
      };
    },

    async updateUser({ userId, oid, tid, sub, email, displayName }) {
      const now = new Date().toISOString();

      const result = await db
        .prepare(
          'UPDATE users SET user_name = ?, updated_at = ? WHERE user_id = ?'
        )
        .bind(displayName, now, userId)
        .run();

      if (result.meta.changes === 0) return null;
      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },
  };
}
