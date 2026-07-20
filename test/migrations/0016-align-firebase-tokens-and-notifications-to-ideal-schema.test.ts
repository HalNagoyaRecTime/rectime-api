import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// migrations/0016_align_firebase_tokens_and_notifications_to_ideal_schema.sql の
// 旧カラムからER図のカラムへのデータ変換を検証する。
const TRANSFORM_STATEMENTS = [
  'ALTER TABLE notification_send_logs RENAME TO notification_send_logs_legacy',
  'ALTER TABLE firebase_tokens RENAME TO firebase_tokens_legacy',
  'DROP INDEX IF EXISTS idx_notification_send_logs_event_id',
  'DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date',
  'DROP INDEX IF EXISTS idx_firebase_tokens_user_id',
  'DROP INDEX IF EXISTS idx_firebase_tokens_active',
  `CREATE TABLE firebase_tokens_new (
    firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES auth_users(id),
    platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
    fcm_token TEXT NOT NULL UNIQUE,
    is_firebase_active INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT INTO firebase_tokens_new (
    firebase_token_id, user_id, platform, fcm_token, is_firebase_active,
    last_seen_at, created_at, updated_at
  )
  SELECT id, user_id,
    CASE lower(platform)
      WHEN 'ios' THEN 1
      WHEN 'android' THEN 2
      WHEN '1' THEN 1
      WHEN '2' THEN 2
    END,
    fcm_token, is_active, last_seen_at, created_at, updated_at
  FROM firebase_tokens_legacy`,
  `CREATE TABLE notification_send_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(event_id),
    firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens_new(firebase_token_id),
    notification_type TEXT NOT NULL,
    scheduled_for_date TEXT NOT NULL,
    fcm_message_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date)
  )`,
  `INSERT INTO notification_send_logs_new (
    id, event_id, firebase_token_id, notification_type, scheduled_for_date,
    fcm_message_id, created_at
  )
  SELECT id, event_id, firebase_token_id, notification_type, scheduled_for_date,
    fcm_message_id, created_at
  FROM notification_send_logs_legacy`,
  'DROP TABLE notification_send_logs_legacy',
  'DROP TABLE firebase_tokens_legacy',
  'ALTER TABLE firebase_tokens_new RENAME TO firebase_tokens',
  'ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs',
  'CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)',
  'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)',
  'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)',
  'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)',
  'ALTER TABLE notifications RENAME TO notifications_legacy',
  `CREATE TABLE notifications_new (
    notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT INTO notifications_new (
    notification_id, notification_type, title, body, created_at, updated_at
  )
  SELECT id, type, title, body, created_at, created_at
  FROM notifications_legacy`,
  'DROP TABLE notifications_legacy',
  'ALTER TABLE notifications_new RENAME TO notifications',
];

async function createLegacyAuthUsers() {
  await env.DB.prepare(
    `CREATE TABLE auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

// #0018 後の最終スキーマには存在しないため、#0016 の変換検証用にだけ作る。
async function createTemporaryNotificationSendLogs() {
  await env.DB.prepare(
    `CREATE TABLE notification_send_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(event_id),
      firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(firebase_token_id),
      notification_type TEXT NOT NULL,
      scheduled_for_date TEXT NOT NULL,
      fcm_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date)
    )`
  ).run();
  await env.DB.batch([
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'
    ),
  ]);
}

async function prepareLegacySchema() {
  await createTemporaryNotificationSendLogs();
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_send_logs_event_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active'),
    env.DB.prepare(
      'ALTER TABLE notification_send_logs RENAME TO notification_send_logs_backup'
    ),
    env.DB.prepare('ALTER TABLE firebase_tokens RENAME TO firebase_tokens_backup'),
    env.DB.prepare('ALTER TABLE notifications RENAME TO notifications_backup'),
    env.DB.prepare(
      `CREATE TABLE firebase_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES auth_users(id),
        platform TEXT NOT NULL,
        fcm_token TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE notification_send_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(event_id),
        firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(id),
        notification_type TEXT NOT NULL,
        scheduled_for_date TEXT NOT NULL,
        fcm_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date)
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_active)'
    ),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens'),
    env.DB.prepare('DROP TABLE IF EXISTS notifications'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs_new'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens_new'),
    env.DB.prepare('DROP TABLE IF EXISTS notifications_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS notifications_new'),
    env.DB.prepare(
      'ALTER TABLE notification_send_logs_backup RENAME TO notification_send_logs'
    ),
    env.DB.prepare('ALTER TABLE firebase_tokens_backup RENAME TO firebase_tokens'),
    env.DB.prepare('ALTER TABLE notifications_backup RENAME TO notifications'),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'
    ),
    env.DB.prepare('CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)'
    ),
  ]);
}

describe('0016_align_firebase_tokens_and_notifications_to_ideal_schema.sql のデータ変換', () => {
  const studentNumber = 'MIG016-001';
  const eventId = 960001;

  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs').run();
    await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
      .bind(eventId)
      .run();
    await env.DB.prepare('DROP TABLE IF EXISTS auth_users').run();
  });

  it('Firebaseトークン・通知・通知送信ログをER図のカラム名と型へ変換して参照を維持する', async () => {
    await createLegacyAuthUsers();
    await prepareLegacySchema();

    const authUser = await env.DB.prepare(
      'INSERT INTO auth_users (student_number) VALUES (?) RETURNING id'
    )
      .bind(studentNumber)
      .first<{ id: number }>();
    const event = await env.DB.prepare(
      'INSERT INTO events (event_id, event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(eventId, '移行テストイベント', 'テスト会場', '0900', '1000')
      .run();
    expect(event.success).toBe(true);
    const iosToken = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_active) VALUES (?, ?, ?, ?) RETURNING id'
    )
      .bind(authUser!.id, 'iOS', 'migration-ios-token', 0)
      .first<{ id: number }>();
    const androidToken = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, ?, ?) RETURNING id'
    )
      .bind(authUser!.id, 'android', 'migration-android-token')
      .first<{ id: number }>();

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO notification_send_logs (event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(eventId, iosToken!.id, 'event_reminder_10min', '2026-07-16', 'msg-016'),
      env.DB.prepare(
        'INSERT INTO notifications (id, type, title, body) VALUES (?, ?, ?, ?)'
      ).bind(960001, 'schedule_change', '予定変更', '集合時刻が変わりました'),
    ]);

    await env.DB.batch(TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql)));

    const tokens = await env.DB.prepare(
      'SELECT firebase_token_id, platform, is_firebase_active FROM firebase_tokens ORDER BY firebase_token_id'
    ).all();
    expect(tokens.results).toEqual([
      {
        firebase_token_id: iosToken!.id,
        platform: 1,
        is_firebase_active: 0,
      },
      {
        firebase_token_id: androidToken!.id,
        platform: 2,
        is_firebase_active: 1,
      },
    ]);

    const notification = await env.DB.prepare(
      'SELECT notification_id, notification_type, title, body, created_at, updated_at FROM notifications WHERE notification_id = ?'
    )
      .bind(960001)
      .first<{ created_at: string; updated_at: string }>();
    expect(notification).toMatchObject({
      notification_id: 960001,
      notification_type: 'schedule_change',
      title: '予定変更',
      body: '集合時刻が変わりました',
    });
    expect(notification!.updated_at).toBe(notification!.created_at);

    const notificationLog = await env.DB.prepare(
      'SELECT firebase_token_id FROM notification_send_logs WHERE event_id = ?'
    )
      .bind(eventId)
      .first();
    expect(notificationLog).toEqual({ firebase_token_id: iosToken!.id });

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_send_logs)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'firebase_tokens',
          from: 'firebase_token_id',
          to: 'firebase_token_id',
        }),
      ])
    );

    const foreignKeyErrors = await env.DB.prepare('PRAGMA foreign_key_check').all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
