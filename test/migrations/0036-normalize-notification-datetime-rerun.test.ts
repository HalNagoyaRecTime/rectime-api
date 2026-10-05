import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0036_normalize_notification_datetime.sql'
  );
  if (!migration) {
    throw new Error(
      '0036_normalize_notification_datetime.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0036再実行テスト';
const tables = [
  'notifications',
  'firebase_tokens',
  'notification_schedules',
  'notification_audiences',
  'notification_recipients',
  'notification_push_deliveries',
] as const;

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM ${table} ORDER BY 1`
    ).all();
    result[table] = results;
  }
  const { results: sequences } = await env.DB.prepare(
    `SELECT name, seq FROM sqlite_sequence WHERE name IN (${tables
      .map(() => '?')
      .join(',')}) ORDER BY name`
  )
    .bind(...tables)
    .all();
  result.sqlite_sequence = sequences;
  return result;
}

describe('0036_normalize_notification_datetime.sql の再実行', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notification_schedules
       WHERE notification_id IN (
         SELECT notification_id FROM notifications WHERE title LIKE ?
       )`
    )
      .bind(`${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM notifications WHERE title LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_name LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
  });

  it('正規化済みのDBへもう一度適用しても、データも採番も変わらない', async () => {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
    )
      .bind(`${testPrefix}利用者`)
      .first<{ user_id: number }>();
    if (!user) throw new Error('failed to create user');

    await env.DB.prepare('PRAGMA ignore_check_constraints = ON').run();

    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         created_by_user_id, push_title, push_body, notification_type,
         title, body, importance, created_at, updated_at
       ) VALUES (?, 'push', 'body', 'notification_general', ?, 'detail',
         'normal', '2026-09-24 01:02:03', '2026-09-24T10:05:06+09:00')
       RETURNING notification_id`
    )
      .bind(user.user_id, `${testPrefix}通知`)
      .first<{ notification_id: number }>();
    const token = await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         user_id, platform, fcm_token, is_firebase_active,
         last_seen_at, created_at, updated_at
       ) VALUES (?, 2, '0036-rerun-token', 1,
         '2026-09-24T10:02:03+09:00', '2026-09-24 02:04:05',
         '2026-09-24T11:06:07+09:00')
       RETURNING firebase_token_id`
    )
      .bind(user.user_id)
      .first<{ firebase_token_id: number }>();
    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id, scheduled_by_user_id, notification_id,
         firebase_token_id, importance, send_status, send_at,
         recipients_resolved_at, started_at, completed_at, stopped_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 2, 'completed',
         '2026-09-24T12:34:56+09:00', '2026-09-24 03:00:00',
         '2026-09-24T12:01:02+09:00', '2026-09-24 03:10:11', NULL,
         '2026-09-24 02:10:11', '2026-09-24T11:12:13+09:00')
       RETURNING notification_schedule_id`
    )
      .bind(
        user.user_id,
        user.user_id,
        notification!.notification_id,
        token!.firebase_token_id
      )
      .first<{ notification_schedule_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_audiences (
         notification_schedule_id, audience_type, resolved_at,
         created_at, updated_at
       ) VALUES (?, 'all', '2026-09-24T12:02:03+09:00',
         '2026-09-24 02:20:21', '2026-09-24T11:22:23+09:00')`
    )
      .bind(schedule!.notification_schedule_id)
      .run();
    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_schedule_id, user_id, created_at
       ) VALUES (?, ?, '2026-09-24 02:30:31')
       RETURNING notification_recipient_id`
    )
      .bind(schedule!.notification_schedule_id, user.user_id)
      .first<{ notification_recipient_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, firebase_token_id, platform, status,
         attempt_count, first_attempt_at, last_attempt_at, next_retry_at,
         sent_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'sent', 1,
         '2026-09-24 03:01:02', '2026-09-24T12:03:04+09:00',
         '2026-09-24 03:05:06', '2026-09-24T12:07:08+09:00',
         '2026-09-24 02:40:41', '2026-09-24T11:42:43+09:00')`
    )
      .bind(recipient!.notification_recipient_id, token!.firebase_token_id)
      .run();
    await env.DB.prepare('PRAGMA ignore_check_constraints = OFF').run();

    await runMigration();
    const afterFirst = await snapshot();
    expect(afterFirst.notifications.length).toBeGreaterThan(0);

    await runMigration();
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
    // 6テーブルの作り直しを2回行うため、既定の5秒では負荷時に足りない。
  }, 30_000);
});
