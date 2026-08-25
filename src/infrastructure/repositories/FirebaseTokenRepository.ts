import { D1Database } from '@cloudflare/workers-types';
import { asc, eq, sql } from 'drizzle-orm';
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

      const [, upsertResult] = await db.batch<{
        firebase_token_id: number;
        user_id: number;
        platform: number;
        is_firebase_active: number;
        last_seen_at: string;
      }>([
        db
          .prepare(
            `UPDATE firebase_tokens
             SET is_firebase_active = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE fcm_token = ?
               AND user_id <> ?
               AND is_firebase_active = 1`
          )
          .bind(input.fcmToken, input.userId),
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
             SELECT user_id, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM users
             WHERE user_id = ?
             ON CONFLICT(user_id) DO UPDATE SET
               platform = excluded.platform,
               fcm_token = excluded.fcm_token,
               is_firebase_active = 1,
               last_seen_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
             RETURNING
               firebase_token_id,
               user_id,
               platform,
               is_firebase_active,
               last_seen_at`
          )
          .bind(platform, input.fcmToken, input.userId),
      ]);

      const registeredToken = upsertResult.results[0];
      if (!registeredToken) throw new Error('User not found');
      return {
        firebase_token_id: registeredToken.firebase_token_id,
        user_id: registeredToken.user_id,
        platform: firebasePlatformToName(
          registeredToken.platform as FirebasePlatform
        ),
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
        .set({ isFirebaseActive: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(firebase_tokens.firebaseTokenId, firebaseTokenId))
        .run();
    },

    async deactivateByUserId(userId: number): Promise<void> {
      await orm
        .update(firebase_tokens)
        .set({ isFirebaseActive: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(firebase_tokens.userId, userId))
        .run();
    },
  };
}
