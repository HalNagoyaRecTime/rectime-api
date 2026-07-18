import { D1Database } from '@cloudflare/workers-types';
import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  FirebaseTokenEntity,
  FirebasePlatform,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
  UserEntity,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import * as schema from '../database/schema';
import { firebase_tokens, students, users } from '../database/schema';

function toUserEntity(row: typeof users.$inferSelect): UserEntity {
  return {
    user_id: row.id,
    user_name: row.userName,
    is_live_active: row.isLiveActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

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

  const findStudentUser = async (
    studentNumber: string
  ): Promise<UserEntity> => {
    const row = await orm
      .select({ user: users })
      .from(students)
      .innerJoin(users, eq(students.userId, users.id))
      .where(eq(students.studentIdNumber, studentNumber))
      .get();

    if (!row) {
      throw new Error('Student not found');
    }

    return toUserEntity(row.user);
  };

  const upsertFirebaseToken = async (
    userId: number,
    input: RegisterFirebaseTokenInput
  ): Promise<FirebaseTokenEntity> => {
    const firebaseToken = await orm
      .insert(firebase_tokens)
      .values({
        userId,
        platform: input.platform,
        fcmToken: input.fcmToken,
        isFirebaseActive: 1,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: firebase_tokens.fcmToken,
        set: {
          userId: sql`excluded.user_id`,
          platform: sql`excluded.platform`,
          isFirebaseActive: 1,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning()
      .get();

    if (!firebaseToken) {
      throw new Error('Failed to register Firebase token');
    }

    return toFirebaseTokenEntity(firebaseToken);
  };

  return {
    async register(
      input: RegisterFirebaseTokenInput
    ): Promise<RegisterFirebaseTokenResult> {
      const user = await findStudentUser(input.studentNumber);
      const firebaseToken = await upsertFirebaseToken(user.user_id, input);
      return { user, firebaseToken };
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
  };
}
