import type { D1Database } from '@cloudflare/workers-types';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';

export function createUserRepository(db: D1Database): IUserRepository {
  return {
    async findUserIdByMicrosoftAccount(oid, tid) {
      // microsoft_account_links.user_id は auth_users(users_id) を参照する
      // （migrations/0010 で旧 users テーブルが auth_users にリネームされた際、
      // 既存の FOREIGN KEY 定義もこの参照先に自動的に書き換えられている）
      const row = await db
        .prepare(
          `SELECT a.users_id
             FROM microsoft_account_links m
             INNER JOIN auth_users a ON a.users_id = m.user_id
            WHERE m.oid = ? AND m.tid = ?`
        )
        .bind(oid, tid)
        .first<{ users_id: string }>();
      return row?.users_id ?? null;
    },

    async createUserWithMicrosoftLink({
      oid,
      tid,
      sub,
      email,
      displayName,
      uid,
      studentNumber,
    }) {
      const userId = crypto.randomUUID();
      const linkId = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.batch([
        db
          .prepare(
            'INSERT INTO auth_users (users_id, display_name, uid, student_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind(userId, displayName, uid, studentNumber, now, now),
        db
          .prepare(
            'INSERT INTO microsoft_account_links (microsoft_account_link_id, user_id, oid, tid) VALUES (?, ?, ?, ?)'
          )
          .bind(linkId, userId, oid, tid),
      ]);

      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },

    async updateUser({ userId, oid, tid, sub, email, displayName, uid }) {
      const now = new Date().toISOString();

      const result = await db
        .prepare(
          'UPDATE auth_users SET display_name = ?, uid = ?, updated_at = ? WHERE users_id = ?'
        )
        .bind(displayName, uid, now, userId)
        .run();

      if (result.meta.changes === 0) return null;
      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },
  };
}
