import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0034_finalize_notification_v2_schema.sql'
  );
  if (!migration) {
    throw new Error(
      '0034_finalize_notification_v2_schema.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0034通知v2最終化テスト';

async function createUser(name: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`${testPrefix}${name}`)
    .first<{ user_id: number }>();
  if (!row) throw new Error('failed to create test user');
  return row.user_id;
}

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0034_finalize_notification_v2_schema.sql', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notifications
       WHERE title LIKE ? OR push_title LIKE ?`
    )
      .bind(`${testPrefix}%`, `${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM firebase_tokens WHERE fcm_token LIKE ?')
      .bind('0034-shared-token%')
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_name LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
  });

  it('Legacy重複Tokenを履歴ごと壊さず完全UNIQUEへ収束する', async () => {
    const historyUserId = await createUser('旧所有者');
    const currentOwnerUserId = await createUser('現在所有者');

    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         push_title, push_body, title, body, notification_type
       ) VALUES (?, '本文', ?, '本文', 'manual')
       RETURNING notification_id`
    )
      .bind(`${testPrefix}通知`, `${testPrefix}通知`)
      .first<{ notification_id: number }>();
    if (!notification) throw new Error('failed to create test notification');

    await env.DB.prepare('DROP INDEX uq_firebase_tokens_fcm_token').run();

    const oldToken = await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         user_id, platform, fcm_token, is_firebase_active
       ) VALUES (?, 2, '0034-shared-token', 0)
       RETURNING firebase_token_id`
    )
      .bind(historyUserId)
      .first<{ firebase_token_id: number }>();
    const currentToken = await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         user_id, platform, fcm_token, is_firebase_active
       ) VALUES (?, 2, '0034-shared-token', 1)
       RETURNING firebase_token_id`
    )
      .bind(currentOwnerUserId)
      .first<{ firebase_token_id: number }>();
    if (!oldToken || !currentToken) throw new Error('failed to create tokens');

    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, firebase_token_id, send_status, send_at
       ) VALUES (?, ?, 'completed', '2026-09-21 00:00:00')
       RETURNING notification_schedule_id`
    )
      .bind(notification.notification_id, oldToken.firebase_token_id)
      .first<{ notification_schedule_id: number }>();
    if (!schedule) throw new Error('failed to create test schedule');

    await runMigration();

    const tokens = await env.DB.prepare(
      `SELECT firebase_token_id, user_id, fcm_token, is_firebase_active
       FROM firebase_tokens
       WHERE firebase_token_id IN (?, ?)
       ORDER BY firebase_token_id`
    )
      .bind(oldToken.firebase_token_id, currentToken.firebase_token_id)
      .all<{
        firebase_token_id: number;
        user_id: number;
        fcm_token: string;
        is_firebase_active: number;
      }>();
    expect(tokens.results).toEqual([
      {
        firebase_token_id: oldToken.firebase_token_id,
        user_id: historyUserId,
        fcm_token: `0034-shared-token#legacy:${oldToken.firebase_token_id}`,
        is_firebase_active: 0,
      },
      {
        firebase_token_id: currentToken.firebase_token_id,
        user_id: currentOwnerUserId,
        fcm_token: '0034-shared-token',
        is_firebase_active: 1,
      },
    ]);

    const scheduleRow = await env.DB.prepare(
      'SELECT firebase_token_id FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(schedule.notification_schedule_id)
      .first<{ firebase_token_id: number | null }>();
    expect(scheduleRow?.firebase_token_id).toBe(oldToken.firebase_token_id);

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(firebase_tokens)'
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toContainEqual(
      expect.objectContaining({
        name: 'uq_firebase_tokens_fcm_token',
        unique: 1,
      })
    );
    expect(indexes.results.map(index => index.name)).not.toContain(
      'idx_firebase_tokens_active_fcm_token'
    );

    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 1, '0034-shared-token')`
      ).bind(historyUserId).run()
    ).rejects.toThrow();

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
