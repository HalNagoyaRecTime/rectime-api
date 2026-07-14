import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
  UserEntity,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import * as schema from '../database/schema';
import {
  entries,
  firebase_tokens,
  notification_users,
  student_description,
} from '../database/schema';

function toUserEntity(row: Record<string, unknown>): UserEntity {
  return {
    id: row.id as number,
    auth_provider: row.auth_provider as string | null,
    provider_user_id: row.provider_user_id as string | null,
    email: row.email as string | null,
    student_number: row.student_number as string,
    is_active: row.is_active as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function toFirebaseTokenEntity(
  row: Record<string, unknown>
): FirebaseTokenEntity {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    platform: row.platform as string,
    fcm_token: row.fcm_token as string,
    is_active: row.is_active as number,
    last_seen_at: row.last_seen_at as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

type FirebaseTokenRow = typeof firebase_tokens.$inferSelect;

function toFirebaseTokenEntityFromDrizzle(
  row: FirebaseTokenRow
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
    const user = await db
      .prepare(
        `
        INSERT INTO users (
          auth_provider,
          provider_user_id,
          email,
          student_number,
          is_active,
          updated_at
        )
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(student_number) DO UPDATE SET
          auth_provider = COALESCE(excluded.auth_provider, users.auth_provider),
          provider_user_id = COALESCE(excluded.provider_user_id, users.provider_user_id),
          email = COALESCE(excluded.email, users.email),
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `
      )
      .bind(
        input.authProvider ?? null,
        input.providerUserId ?? null,
        input.email ?? null,
        input.studentNumber
      )
      .first<Record<string, unknown>>();

    if (!user) {
      throw new Error('Failed to register user');
    }

    return toUserEntity(user);
  };

  const upsertFirebaseToken = async (
    userId: number,
    input: RegisterFirebaseTokenInput
  ): Promise<FirebaseTokenEntity> => {
    const firebaseToken = await db
      .prepare(
        `
        INSERT INTO firebase_tokens (
          user_id,
          platform,
          fcm_token,
          is_active,
          last_seen_at,
          updated_at
        )
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(fcm_token) DO UPDATE SET
          user_id = excluded.user_id,
          platform = excluded.platform,
          is_active = 1,
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `
      )
      .bind(userId, input.platform, input.fcmToken)
      .first<Record<string, unknown>>();

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

    async findActiveTokensForEvent(
      eventId: number
    ): Promise<FirebaseTokenEntity[]> {
      const rows = await orm
        .select({ firebaseToken: firebase_tokens })
        .from(firebase_tokens)
        .innerJoin(
          notification_users,
          eq(notification_users.id, firebase_tokens.userId)
        )
        .innerJoin(
          student_description,
          eq(
            student_description.studentIdNumber,
            notification_users.studentNumber
          )
        )
        .innerJoin(entries, eq(entries.studentId, student_description.id))
        .where(
          and(
            eq(entries.eventId, eventId),
            eq(firebase_tokens.isActive, 1),
            eq(notification_users.isActive, 1)
          )
        )
        .orderBy(firebase_tokens.id);

      return rows.map(row =>
        toFirebaseTokenEntityFromDrizzle(row.firebaseToken)
      );
    },

    async findActiveTokensForAllUsers(): Promise<FirebaseTokenEntity[]> {
      const rows = await orm
        .select({ firebaseToken: firebase_tokens })
        .from(firebase_tokens)
        .innerJoin(
          notification_users,
          eq(notification_users.id, firebase_tokens.userId)
        )
        .where(
          and(
            eq(firebase_tokens.isActive, 1),
            eq(notification_users.isActive, 1)
          )
        )
        .orderBy(firebase_tokens.id);

      return rows.map(row =>
        toFirebaseTokenEntityFromDrizzle(row.firebaseToken)
      );
    },

    async findActiveTokensForGroups(
      targetIds: string[]
    ): Promise<FirebaseTokenEntity[]> {
      if (targetIds.length === 0) {
        return [];
      }

      const placeholders = targetIds.map(() => '?').join(', ');
      const rows = await db
        .prepare(
          `
          SELECT firebase_tokens.*
          FROM firebase_tokens
          INNER JOIN users notification_users
            ON notification_users.id = firebase_tokens.user_id
          INNER JOIN m_student_description
            ON m_student_description.f_student_id_number = notification_users.student_number
          INNER JOIN m_users
            ON m_users.f_users_id = m_student_description.f_users_id
          WHERE firebase_tokens.is_active = 1
            AND notification_users.is_active = 1
            AND CAST(m_users.f_class_room_id AS TEXT) IN (${placeholders})
          ORDER BY firebase_tokens.id
          `
        )
        .bind(...targetIds)
        .all<Record<string, unknown>>();

      return rows.results.map(toFirebaseTokenEntity);
    },

    async deactivate(id: number): Promise<void> {
      await db
        .prepare(
          `
          UPDATE firebase_tokens
          SET is_active = 0,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `
        )
        .bind(id)
        .run();
    },
  };
}
