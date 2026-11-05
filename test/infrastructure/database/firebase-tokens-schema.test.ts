import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// firebase_tokens は通知v2で1利用者複数端末モデルへ移行した。
// 旧active flagは廃止し、fcm_tokenは完全UNIQUEとする。
describe('firebase_tokens テーブルの制約', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM firebase_tokens WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE 'Firebaseスキーマテスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE 'Firebaseスキーマテスト%'"
    ).run();
  });

  async function createTestUser(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
    )
      .bind(name)
      .first<{ user_id: number }>();
    if (!row) throw new Error('failed to create test user');
    return row.user_id;
  }

  async function insertToken(userId: number, fcmToken: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
       VALUES (?, 2, ?)`
    )
      .bind(userId, fcmToken)
      .run();
  }

  it('同じ user_id で複数Tokenを登録できる', async () => {
    const userId = await createTestUser('Firebaseスキーマテスト1利用者1行');
    await insertToken(userId, 'schema-token-first');

    await insertToken(userId, 'schema-token-second');
    const rows = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(rows?.count).toBe(2);
  });

  it('同じ fcm_token は1つしか作れない', async () => {
    const firstOwnerId = await createTestUser(
      'Firebaseスキーマテストfcm_token所有者1'
    );
    const secondOwnerId = await createTestUser(
      'Firebaseスキーマテストfcm_token所有者2'
    );

    await insertToken(firstOwnerId, 'schema-token-shared-first');
    await expect(
      insertToken(secondOwnerId, 'schema-token-shared-first')
    ).rejects.toThrow();

    await insertToken(secondOwnerId, 'schema-token-shared-second');
    await expect(
      insertToken(firstOwnerId, 'schema-token-shared-second')
    ).rejects.toThrow();
  });
  it('platformは1または2だけを許可する', async () => {
    const userId = await createTestUser('Firebaseスキーマテストplatform検証');

    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 0, 'schema-token-invalid-platform-0')`
      )
        .bind(userId)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 3, 'schema-token-invalid-platform-3')`
      )
        .bind(userId)
        .run()
    ).rejects.toThrow();
  });

  it('notification_schedules は firebase_tokens を参照しない', async () => {
    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_schedules)'
    ).all<{ table: string; from: string; to: string }>();

    expect(foreignKeys.results).not.toContainEqual(
      expect.objectContaining({ table: 'firebase_tokens' })
    );
  });
});
