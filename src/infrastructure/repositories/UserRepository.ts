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
        .first<{ user_id: string }>();
      return row?.user_id ?? null;
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
            'INSERT INTO users (user_id, display_name, uid, student_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
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

      await db.batch([
        db
          .prepare(
            'UPDATE users SET display_name = ?, uid = ?, updated_at = ? WHERE user_id = ?'
          )
          .bind(displayName, uid, now, userId),
        db
          .prepare(
            'UPDATE microsoft_account_links SET oid = ?, tid = ? WHERE user_id = ?'
          )
          .bind(oid, tid, userId),
      ]);

      return { id: userId, oid, tid, sub, email, display_name: displayName };
    },
  };
}
