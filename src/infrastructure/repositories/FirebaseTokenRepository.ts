import { D1Database } from '@cloudflare/workers-types';
import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
  UserEntity,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import * as schema from '../database/schema';
import { auth_users, firebase_tokens } from '../database/schema';

function toUserEntity(row: typeof auth_users.$inferSelect): UserEntity {
  return {
    id: row.id,
    auth_provider: row.authProvider,
    provider_user_id: row.providerUserId,
    email: row.email,
    student_number: row.studentNumber,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function toFirebaseTokenEntity(
  row: typeof firebase_tokens.$inferSelect
): FirebaseTokenEntity {
  return {
    id: row.id,
    user_id: row.userId,
    platform: row.platform,
    fcm_token: row.fcmToken,
    is_active: row.isActive,
    last_seen_at: row.lastSeenAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createFirebaseTokenRepository(
  db: D1Database
): IFirebaseTokenRepository {
  const orm = drizzle(db, { schema });

  const upsertUser = async (
    input: RegisterFirebaseTokenInput
  ): Promise<UserEntity> => {
    const user = await orm
      .insert(auth_users)
      .values({
        authProvider: input.authProvider ?? null,
        providerUserId: input.providerUserId ?? null,
        email: input.email ?? null,
        studentNumber: input.studentNumber,
        isActive: 1,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: auth_users.studentNumber,
        set: {
          authProvider: sql`COALESCE(excluded.auth_provider, ${auth_users.authProvider})`,
          providerUserId: sql`COALESCE(excluded.provider_user_id, ${auth_users.providerUserId})`,
          email: sql`COALESCE(excluded.email, ${auth_users.email})`,
          isActive: 1,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning()
      .get();

    if (!user) {
      throw new Error('Failed to register user');
    }

    return toUserEntity(user);
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
        isActive: 1,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: firebase_tokens.fcmToken,
        set: {
          userId: sql`excluded.user_id`,
          platform: sql`excluded.platform`,
          isActive: 1,
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
      const user = await upsertUser(input);
      const firebaseToken = await upsertFirebaseToken(user.id, input);
      return { user, firebaseToken };
    },

    async findActiveTokens(): Promise<FirebaseTokenEntity[]> {
      const tokens = await orm
        .select()
        .from(firebase_tokens)
        .where(eq(firebase_tokens.isActive, 1))
        .orderBy(asc(firebase_tokens.id))
        .all();

      return tokens.map(toFirebaseTokenEntity);
    },

    async deactivate(id: number): Promise<void> {
      await orm
        .update(firebase_tokens)
        .set({ isActive: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(firebase_tokens.id, id))
        .run();
    },
  };
}
