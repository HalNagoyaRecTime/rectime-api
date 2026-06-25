import { D1Database } from '@cloudflare/workers-types';
import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
  UserEntity,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';

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

export function createFirebaseTokenRepository(
  db: D1Database
): IFirebaseTokenRepository {
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
      const result = await db
        .prepare(
          `
          SELECT ft.*
          FROM firebase_tokens ft
          INNER JOIN users u
            ON u.id = ft.user_id
          INNER JOIN m_student_description sd
            ON sd.f_student_id_number = u.student_number
          INNER JOIN t_entries e
            ON e.f_student_id = sd.f_student_id
          WHERE e.f_event_id = ?
            AND ft.is_active = 1
            AND u.is_active = 1
          ORDER BY ft.id
          `
        )
        .bind(eventId)
        .all<Record<string, unknown>>();

      return result.results.map(toFirebaseTokenEntity);
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
