import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// migrations/0017_unify_auth_users_with_users.sql のうち、auth_users から
// students を経由して users へ Firebase トークンの参照先を付け替える変換を検証する。
// 0017 適用後のテストDBでは auth_users が存在しないため、直前の0016時点の形状を
// テスト内で復元してから、migrationと同一のSQLを再実行する。
const TRANSFORM_STATEMENTS = [
  `CREATE TABLE __migration_0017_guard (
    unmatched_token_count INTEGER CHECK (unmatched_token_count = 0)
  )`,
  `INSERT INTO __migration_0017_guard (unmatched_token_count)
   SELECT COUNT(*)
   FROM firebase_tokens ft
   LEFT JOIN auth_users au ON au.id = ft.user_id
   LEFT JOIN students s ON s.student_id_number = au.student_number
   WHERE au.id IS NULL OR s.user_id IS NULL`,
  'DROP TABLE __migration_0017_guard',
  'ALTER TABLE notification_send_logs RENAME TO notification_send_logs_legacy',
  'ALTER TABLE firebase_tokens RENAME TO firebase_tokens_legacy',
  'DROP INDEX IF EXISTS idx_notification_send_logs_event_id',
  'DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date',
  'DROP INDEX IF EXISTS idx_firebase_tokens_user_id',
  'DROP INDEX IF EXISTS idx_firebase_tokens_active',
  `CREATE TABLE firebase_tokens_new (
    firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
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
  SELECT ft.firebase_token_id, s.user_id, ft.platform, ft.fcm_token,
    ft.is_firebase_active, ft.last_seen_at, ft.created_at, ft.updated_at
  FROM firebase_tokens_legacy ft
  INNER JOIN auth_users au ON au.id = ft.user_id
  INNER JOIN students s ON s.student_id_number = au.student_number`,
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
  'DROP TABLE auth_users',
  'ALTER TABLE firebase_tokens_new RENAME TO firebase_tokens',
  'ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs',
  'CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)',
  'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)',
  'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)',
  'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)',
];

// #0018 適用後は旧送信ログが無いため、#0017 の単体変換を検証する間だけ再現する。
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

async function preparePre0017Schema() {
  await createTemporaryNotificationSendLogs();
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_send_logs_event_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active'),
    env.DB.prepare('ALTER TABLE notification_send_logs RENAME TO notification_send_logs_backup'),
    env.DB.prepare('ALTER TABLE firebase_tokens RENAME TO firebase_tokens_backup'),
    env.DB.prepare(
      `CREATE TABLE auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_number TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE firebase_tokens (
        firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES auth_users(id),
        platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
        fcm_token TEXT NOT NULL UNIQUE,
        is_firebase_active INTEGER NOT NULL DEFAULT 1,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
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
    ),
    env.DB.prepare('CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'),
    env.DB.prepare('CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)'),
    env.DB.prepare('CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'),
    env.DB.prepare('CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens'),
    env.DB.prepare('DROP TABLE IF EXISTS auth_users'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs_new'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS firebase_tokens_new'),
    env.DB.prepare('ALTER TABLE notification_send_logs_backup RENAME TO notification_send_logs'),
    env.DB.prepare('ALTER TABLE firebase_tokens_backup RENAME TO firebase_tokens'),
    env.DB.prepare('CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'),
    env.DB.prepare('CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)'),
    env.DB.prepare('CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'),
    env.DB.prepare('CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'),
  ]);
}

describe('0017_unify_auth_users_with_users.sql のデータ変換', () => {
  const studentNumber = 'MIG017-001';
  const unmatchedStudentNumber = 'MIG017-UNMATCHED';
  const classCode = 'MIG017';
  const eventName = '0017移行テストイベント';

  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs').run();
    await env.DB.prepare('DELETE FROM events WHERE event_name = ?').bind(eventName).run();
    await env.DB.prepare('DELETE FROM students WHERE student_id_number IN (?, ?)')
      .bind(studentNumber, unmatchedStudentNumber)
      .run();
    await env.DB.prepare("DELETE FROM users WHERE user_name LIKE '0017移行テスト%' ").run();
    await env.DB.prepare('DELETE FROM class_rooms WHERE class_code = ?').bind(classCode).run();
  });

  it('students.student_id_numberを介してFirebaseトークンと送信ログの参照をusersへ移行し、auth_usersを削除する', async () => {
    const classRoom = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name) VALUES (?, ?) RETURNING class_room_id'
    ).bind(classCode, '0017移行テスト学級').first<{ class_room_id: number }>();
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    ).bind('0017移行テスト生徒').first<{ user_id: number }>();
    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    ).bind(user!.user_id, classRoom!.class_room_id, 1, studentNumber).run();
    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    ).bind(eventName, 'テスト会場', '0900', '1000').first<{ event_id: number }>();

    await preparePre0017Schema();
    const authUser = await env.DB.prepare(
      'INSERT INTO auth_users (student_number) VALUES (?) RETURNING id'
    ).bind(studentNumber).first<{ id: number }>();
    const token = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, ?, ?) RETURNING firebase_token_id'
    ).bind(authUser!.id, 2, 'migration-0017-token').first<{ firebase_token_id: number }>();
    await env.DB.prepare(
      'INSERT INTO notification_send_logs (event_id, firebase_token_id, notification_type, scheduled_for_date) VALUES (?, ?, ?, ?)'
    ).bind(event!.event_id, token!.firebase_token_id, 'event_reminder', '2026-07-16').run();

    await env.DB.batch(TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql)));

    const migratedToken = await env.DB.prepare(
      'SELECT firebase_token_id, user_id, platform FROM firebase_tokens WHERE fcm_token = ?'
    ).bind('migration-0017-token').first();
    expect(migratedToken).toEqual({
      firebase_token_id: token!.firebase_token_id,
      user_id: user!.user_id,
      platform: 2,
    });
    const migratedLog = await env.DB.prepare(
      'SELECT event_id, firebase_token_id FROM notification_send_logs WHERE event_id = ?'
    ).bind(event!.event_id).first();
    expect(migratedLog).toEqual({
      event_id: event!.event_id,
      firebase_token_id: token!.firebase_token_id,
    });
    const authUsers = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_users'"
    ).first();
    expect(authUsers).toBeNull();
    const foreignKeyErrors = await env.DB.prepare('PRAGMA foreign_key_check').all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('studentsに対応しないFirebaseトークンがある場合、データを失わずmigrationを中断する', async () => {
    await preparePre0017Schema();
    const authUser = await env.DB.prepare(
      'INSERT INTO auth_users (student_number) VALUES (?) RETURNING id'
    ).bind(unmatchedStudentNumber).first<{ id: number }>();
    await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, ?, ?)'
    ).bind(authUser!.id, 1, 'migration-0017-unmatched-token').run();

    await expect(
      env.DB.batch(TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql)))
    ).rejects.toThrow('CHECK constraint failed');

    const token = await env.DB.prepare(
      'SELECT fcm_token FROM firebase_tokens WHERE fcm_token = ?'
    ).bind('migration-0017-unmatched-token').first();
    expect(token).toEqual({ fcm_token: 'migration-0017-unmatched-token' });
  });
});
