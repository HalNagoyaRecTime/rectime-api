import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// firebase_tokens は migrations/0028 で「1利用者1端末」モデルへ揃えた。
// user_id への UNIQUE で1利用者1行を保証しつつ、fcm_token の UNIQUE は
// 有効な行だけに限定している。端末を別の利用者へ付け替えるとき、旧所有者の行は
// notification_schedules から参照されていて削除できず、無効化して残すため。
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

  async function insertToken(
    userId: number,
    fcmToken: string,
    isActive: number
  ): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active)
       VALUES (?, 2, ?, ?)`
    )
      .bind(userId, fcmToken, isActive)
      .run();
  }

  it('同じ user_id で2行目を作ろうとすると UNIQUE 制約で失敗する', async () => {
    const userId = await createTestUser('Firebaseスキーマテスト1利用者1行');
    await insertToken(userId, 'schema-token-first', 1);

    await expect(
      insertToken(userId, 'schema-token-second', 1)
    ).rejects.toThrow();
  });

  it('同じ fcm_token を持つ有効な行は1つしか作れない', async () => {
    const ownerId = await createTestUser('Firebaseスキーマテスト端末所有者');
    const otherId = await createTestUser('Firebaseスキーマテスト別利用者');
    await insertToken(ownerId, 'schema-token-shared', 1);

    await expect(
      insertToken(otherId, 'schema-token-shared', 1)
    ).rejects.toThrow();
  });

  it('旧所有者の行が無効なら同じ fcm_token を別の利用者へ付け替えられる', async () => {
    const previousOwnerId = await createTestUser(
      'Firebaseスキーマテスト旧所有者'
    );
    const newOwnerId = await createTestUser('Firebaseスキーマテスト新所有者');
    await insertToken(previousOwnerId, 'schema-token-handover', 0);

    await insertToken(newOwnerId, 'schema-token-handover', 1);

    const owners = await env.DB.prepare(
      `SELECT user_id, is_firebase_active
       FROM firebase_tokens
       WHERE fcm_token = ?
       ORDER BY user_id`
    )
      .bind('schema-token-handover')
      .all<{ user_id: number; is_firebase_active: number }>();
    expect(owners.results).toHaveLength(2);
    expect(owners.results.filter(row => row.is_firebase_active === 1)).toEqual([
      { user_id: newOwnerId, is_firebase_active: 1 },
    ]);
  });

  it('notification_schedules から firebase_tokens を参照できる', async () => {
    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_schedules)'
    ).all<{ table: string; from: string; to: string }>();

    expect(foreignKeys.results).toContainEqual(
      expect.objectContaining({
        table: 'firebase_tokens',
        from: 'firebase_token_id',
        to: 'firebase_token_id',
      })
    );
  });
});
