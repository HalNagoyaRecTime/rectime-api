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

type FirebaseTokenRegistrationRow = {
  firebase_token_id: number;
  user_id: number;
  platform: number;
  is_firebase_active: number;
  last_seen_at: string;
};

function toFirebaseTokenEntity(
  row: typeof firebase_tokens.$inferSelect
): FirebaseTokenEntity {
  if (row.platform !== 1 && row.platform !== 2) {
    throw new Error('Unexpected Firebase platform: ' + row.platform);
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

      // D1 batchで所有者移転・同一UserのUPSERT・新規作成をまとめる。
      // 旧owner rowを削除するため、過去Delivery FKはNULLになり、新rowへ移らない。
      const [, updateResult, insertResult] =
        await db.batch<FirebaseTokenRegistrationRow>([
          db
            .prepare(
              `
            DELETE FROM firebase_tokens
            WHERE fcm_token = ?
              AND user_id <> ?
              AND EXISTS (
                SELECT 1
                FROM users
                WHERE user_id = ?
              )
          `
            )
            .bind(input.fcmToken, input.userId, input.userId),
          db
            .prepare(
              `
            UPDATE firebase_tokens
            SET platform = ?,
                is_firebase_active = 1,
                last_seen_at = ?,
                updated_at = ?
            WHERE user_id = ?
              AND fcm_token = ?
            RETURNING
              firebase_token_id,
              user_id,
              platform,
              is_firebase_active,
              last_seen_at
          `
            )
            .bind(platform, now, now, input.userId, input.fcmToken),
          db
            .prepare(
              `
            INSERT INTO firebase_tokens (
              user_id,
              platform,
              fcm_token,
              is_firebase_active,
              last_seen_at,
              created_at,
              updated_at
            )
            SELECT user_id, ?, ?, 1, ?, ?, ?
            FROM users
            WHERE user_id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM firebase_tokens
                WHERE user_id = ?
                  AND fcm_token = ?
              )
            RETURNING
              firebase_token_id,
              user_id,
              platform,
              is_firebase_active,
              last_seen_at
          `
            )
            .bind(
              platform,
              input.fcmToken,
              now,
              now,
              now,
              input.userId,
              input.userId,
              input.fcmToken
            ),
        ]);

      const registeredToken =
        updateResult.results[0] ?? insertResult.results[0];
      if (!registeredToken) {
        const user = await db
          .prepare('SELECT user_id FROM users WHERE user_id = ?')
          .bind(input.userId)
          .first<{ user_id: number }>();
        if (!user) throw new Error('User not found');
        throw new Error('Firebase token registration failed');
      }

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

    // FKのON DELETE SET NULLにより、Legacy予定とv2配信履歴はToken参照を失う。
    async deleteById(firebaseTokenId: number): Promise<void> {
      await orm
        .delete(firebase_tokens)
        .where(eq(firebase_tokens.firebaseTokenId, firebaseTokenId))
        .run();
    },

    async deactivateByUserId(userId: number): Promise<void> {
      const now = notificationUtcNow();
      await orm
        .update(firebase_tokens)
        .set({ isFirebaseActive: 0, updatedAt: now })
        .where(eq(firebase_tokens.userId, userId))
        .run();
    },

    async findAllByUserId(userId: number): Promise<FirebaseTokenEntity[]> {
      const rows = await orm
        .select()
        .from(firebase_tokens)
        .where(eq(firebase_tokens.userId, userId))
        .orderBy(asc(firebase_tokens.firebaseTokenId))
        .all();
      return rows.map(toFirebaseTokenEntity);
    },

    // logoutはownerと現在Tokenを限定して物理削除する。既に無くても成功する。
    async deleteByUserIdAndFcmToken(
      userId: number,
      fcmToken: string
    ): Promise<void> {
      await db
        .prepare(
          `
          DELETE FROM firebase_tokens
          WHERE user_id = ?
            AND fcm_token = ?
        `
        )
        .bind(userId, fcmToken)
        .run();
    },

    async deleteByUserId(userId: number): Promise<void> {
      await orm
        .delete(firebase_tokens)
        .where(eq(firebase_tokens.userId, userId))
        .run();
    },
  };
}
