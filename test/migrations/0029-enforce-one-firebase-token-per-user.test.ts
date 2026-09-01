import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0029_enforce_one_firebase_token_per_user.sql'
  );
  if (!migration) {
    throw new Error(
      '0029_enforce_one_firebase_token_per_user.sql is not registered'
    );
  }
  return migration.queries;
})();

async function prepareLegacySchema() {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_due'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_event_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_notification_id'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules RENAME TO notification_schedules_backup'
    ),
    env.DB.prepare(
      'ALTER TABLE firebase_tokens RENAME TO firebase_tokens_backup'
    ),
    env.DB.prepare(
      `CREATE TABLE firebase_tokens (
        firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
        fcm_token TEXT NOT NULL UNIQUE,
        is_firebase_active INTEGER NOT NULL DEFAULT 1,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE notification_schedules (
        notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_user_id INTEGER REFERENCES users(user_id),
        event_id INTEGER REFERENCES events(event_id),
        notification_id INTEGER NOT NULL REFERENCES notifications(notification_id),
        firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(firebase_token_id),
        importance INTEGER NOT NULL DEFAULT 2
          CHECK (importance BETWEEN 1 AND 4),
        send_status TEXT NOT NULL DEFAULT 'draft'
          CHECK (send_status IN ('draft', 'sending', 'sent', 'failed')),
        fcm_message_id TEXT,
        failed_reason TEXT,
        send_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'
    ),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS __migration_0029_guard'),
    env.DB.prepare('DROP TABLE IF EXISTS __migration_0029_sequences'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_schedules_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_schedules'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_user_id'),
    env.DB.prepare(
      'ALTER TABLE firebase_tokens_backup RENAME TO firebase_tokens'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules_backup RENAME TO notification_schedules'
    ),
    env.DB.prepare(
      `CREATE UNIQUE INDEX idx_firebase_tokens_active_fcm_token
        ON firebase_tokens(fcm_token)
        WHERE is_firebase_active = 1`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_due ON notification_schedules(send_status, send_at)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_event_id ON notification_schedules(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_notification_id ON notification_schedules(notification_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_firebase_token_id ON notification_schedules(firebase_token_id)'
    ),
  ]);
}

async function runMigration() {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function createUser(userName: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  if (!row) throw new Error('failed to create test user');
  return row.user_id;
}

async function createNotification(): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notifications (notification_type, title, body)
     VALUES ('manual', '0029移行確認', '0029移行確認')
     RETURNING notification_id`
  ).first<{ notification_id: number }>();
  if (!row) throw new Error('failed to create notification');
  return row.notification_id;
}

describe('0029_enforce_one_firebase_token_per_user.sql のデータ変換', () => {
  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare(
      "DELETE FROM notifications WHERE title = '0029移行確認'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE '0029移行確認%'"
    ).run();
  });

  it('IDと日時を保ったまま移行し、送信予定の参照先を維持する', async () => {
    await prepareLegacySchema();
    const userId = await createUser('0029移行確認1');
    const notificationId = await createNotification();
    await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token,
         is_firebase_active, last_seen_at, created_at, updated_at
       ) VALUES (4001, ?, 2, 'migration-token', 1,
         '2026-07-01 01:02:03', '2026-07-02 04:05:06', '2026-07-03 07:08:09')`
    )
      .bind(userId)
      .run();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_schedule_id, notification_id, firebase_token_id,
         send_at, created_at, updated_at
       ) VALUES (5001, ?, 4001, '2026-07-04 09:00:00',
         '2026-07-04 01:02:03', '2026-07-04 04:05:06')`
    )
      .bind(notificationId)
      .run();

    await runMigration();

    const token = await env.DB.prepare(
      'SELECT * FROM firebase_tokens WHERE firebase_token_id = 4001'
    ).first();
    expect(token).toMatchObject({
      firebase_token_id: 4001,
      user_id: userId,
      platform: 2,
      fcm_token: 'migration-token',
      is_firebase_active: 1,
      last_seen_at: '2026-07-01 01:02:03',
      created_at: '2026-07-02 04:05:06',
      updated_at: '2026-07-03 07:08:09',
    });
    const schedule = await env.DB.prepare(
      'SELECT * FROM notification_schedules WHERE notification_schedule_id = 5001'
    ).first();
    expect(schedule).toMatchObject({
      notification_schedule_id: 5001,
      firebase_token_id: 4001,
      send_at: '2026-07-04 09:00:00',
      created_at: '2026-07-04 01:02:03',
    });

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
    const scheduleForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_schedules)'
    ).all<{ table: string; from: string; to: string }>();
    expect(scheduleForeignKeys.results).toContainEqual(
      expect.objectContaining({
        table: 'firebase_tokens',
        from: 'firebase_token_id',
        to: 'firebase_token_id',
      })
    );
  });

  it('移行後は1利用者1行に制限し、有効な行だけTokenの重複を禁じる', async () => {
    await prepareLegacySchema();
    const ownerId = await createUser('0029移行確認所有者');
    const otherId = await createUser('0029移行確認別利用者');
    await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-owned')"
    )
      .bind(ownerId)
      .run();

    await runMigration();

    await expect(
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-second-device')"
      )
        .bind(ownerId)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-owned')"
      )
        .bind(otherId)
        .run()
    ).rejects.toThrow();

    await env.DB.prepare(
      'UPDATE firebase_tokens SET is_firebase_active = 0 WHERE user_id = ?'
    )
      .bind(ownerId)
      .run();

    await expect(
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-owned')"
      )
        .bind(otherId)
        .run()
    ).resolves.toBeDefined();
  });

  it('移行前の全行が削除済みでもAUTOINCREMENTの高水位を保つ', async () => {
    await prepareLegacySchema();
    const userId = await createUser('0029移行確認全削除');
    const notificationId = await createNotification();
    await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token
       ) VALUES (6100, ?, 2, 'migration-deleted-token')`
    )
      .bind(userId)
      .run();
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_schedule_id, notification_id, firebase_token_id, send_at
       ) VALUES (7100, ?, 6100, '2026-07-04 09:00:00')`
    )
      .bind(notificationId)
      .run();
    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = 7100'
    ).run();
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = 6100'
    ).run();

    await runMigration();

    const nextToken = await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-next-token') RETURNING firebase_token_id"
    )
      .bind(userId)
      .first<{ firebase_token_id: number }>();
    const nextSchedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (notification_id, firebase_token_id, send_at) VALUES (?, ?, '2026-07-05 09:00:00') RETURNING notification_schedule_id"
    )
      .bind(notificationId, nextToken!.firebase_token_id)
      .first<{ notification_schedule_id: number }>();

    expect(nextToken!.firebase_token_id).toBeGreaterThan(6100);
    expect(nextSchedule!.notification_schedule_id).toBeGreaterThan(7100);
  });

  it('1利用者に複数行がある場合はデータを残して中止する', async () => {
    await prepareLegacySchema();
    const userId = await createUser('0029移行確認重複');
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-duplicate-1')"
      ).bind(userId),
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'migration-duplicate-2')"
      ).bind(userId),
    ]);

    await expect(runMigration()).rejects.toThrow('CHECK constraint failed');

    const remaining = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(remaining?.count).toBe(2);
  });
});
