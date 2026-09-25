import { D1Database } from '@cloudflare/workers-types';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  FirebaseTokenEntity,
  FirebasePlatform,
  firebasePlatformToCode,
  firebasePlatformToName,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import * as schema from '../database/schema';
import { notificationUtcNow } from '../database/notificationDateTime';
import { firebase_tokens } from '../database/schema';

function toFirebaseTokenEntity(
  row: typeof firebase_tokens.$inferSelect
): FirebaseTokenEntity {
  if (row.platform !== 1 && row.platform !== 2) {
    throw new Error(`Unexpected Firebase platform: ${row.platform}`);
  }

  return {
    firebase_token_id: row.firebaseTokenId,
    user_id: row.userId,
    platform: row.platform as FirebasePlatform,
    fcm_token: row.fcmToken,
    is_firebase_active: row.isFirebaseActive,
    last_seen_at: row.lastSeenAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createFirebaseTokenRepository(
  db: D1Database
): IFirebaseTokenRepository {
  const orm = drizzle(db, { schema });

  return {
    async register(
      input: RegisterFirebaseTokenInput
    ): Promise<RegisterFirebaseTokenResult> {
      const platform = firebasePlatformToCode(input.platform);
      const now = notificationUtcNow();

      const [, updateResult, insertResult] = await db.batch<{
        firebase_token_id: number;
        user_id: number;
        platform: number;
        is_firebase_active: number;
        last_seen_at: string;
      }>([
        db
          .prepare(
            `DELETE FROM firebase_tokens
             WHERE fcm_token = ?
               AND user_id <> ?
               AND EXISTS (
                 SELECT 1
                 FROM users
                 WHERE user_id = ?
               )`
          )
          .bind(input.fcmToken, input.userId, input.userId),
        db
          .prepare(
            `UPDATE firebase_tokens
             SET platform = ?,
                 fcm_token = ?,
                 is_firebase_active = 1,
                 last_seen_at = ?,
                 updated_at = ?
             WHERE firebase_token_id = (
               SELECT firebase_token_id
               FROM firebase_tokens
               WHERE user_id = ?
               ORDER BY
                 CASE WHEN fcm_token = ? THEN 0 ELSE 1 END,
                 firebase_token_id
               LIMIT 1
             )
             RETURNING
               firebase_token_id,
               user_id,
               platform,
               is_firebase_active,
               last_seen_at`
          )
          .bind(
            platform,
            input.fcmToken,
            now,
            now,
            input.userId,
            input.fcmToken
          ),
        db
          .prepare(
            `INSERT INTO firebase_tokens (
               user_id,
               platform,
               fcm_token,
               is_firebase_active,
               last_seen_at,
               updated_at
             )
             SELECT user_id, ?, ?, 1, ?, ?
             FROM users
             WHERE user_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM firebase_tokens WHERE user_id = ?
               )
               AND NOT EXISTS (
                 SELECT 1 FROM firebase_tokens WHERE fcm_token = ?
               )
             RETURNING
               firebase_token_id,
               user_id,
               platform,
               is_firebase_active,
               last_seen_at`
          )
          .bind(
            platform,
            input.fcmToken,
            now,
            now,
            input.userId,
            input.userId,
            input.fcmToken
          ),
      ]);
      const registeredToken =
        updateResult.results[0] ??
        insertResult.results[0] ??
        (await db
          .prepare(
            `SELECT firebase_token_id, user_id, platform,
                    is_firebase_active, last_seen_at
             FROM firebase_tokens
             WHERE user_id = ?
             ORDER BY firebase_token_id
             LIMIT 1`
          )
          .bind(input.userId)
          .first<{
            firebase_token_id: number;
            user_id: number;
            platform: number;
            is_firebase_active: number;
            last_seen_at: string;
          }>());
      if (!registeredToken) throw new Error('User not found');
      return {
        firebase_token_id: registeredToken.firebase_token_id,
        user_id: registeredToken.user_id,
        platform: firebasePlatformToName(registeredToken.platform),
        is_firebase_active: registeredToken.is_firebase_active === 1,
        last_seen_at: registeredToken.last_seen_at,
      };
    },

    async findActiveTokens(): Promise<FirebaseTokenEntity[]> {
      const tokens = await orm
        .select()
        .from(firebase_tokens)
        .where(eq(firebase_tokens.isFirebaseActive, 1))
        .orderBy(asc(firebase_tokens.firebaseTokenId))
        .all();

      return tokens.map(toFirebaseTokenEntity);
    },

    async deactivate(firebaseTokenId: number): Promise<void> {
      await orm
        .update(firebase_tokens)
        .set({ isFirebaseActive: 0, updatedAt: notificationUtcNow() })
        .where(eq(firebase_tokens.firebaseTokenId, firebaseTokenId))
        .run();
    },

    async deactivateByUserId(userId: number): Promise<void> {
      await orm
        .update(firebase_tokens)
        .set({ isFirebaseActive: 0, updatedAt: notificationUtcNow() })
        .where(eq(firebase_tokens.userId, userId))
        .run();
    },

    async findByUserId(userId: number): Promise<FirebaseTokenEntity | null> {
      const row = await orm
        .select()
        .from(firebase_tokens)
        .where(eq(firebase_tokens.userId, userId))
        .get();
      return row ? toFirebaseTokenEntity(row) : null;
    },

    async deleteByUserId(userId: number): Promise<void> {
      await orm
        .delete(firebase_tokens)
        .where(eq(firebase_tokens.userId, userId))
        .run();
    },
  };
}
