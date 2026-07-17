import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// migrations/0013_migrate_events_to_ideal_schema.sql のデータ変換を検証する。
// 本番と同じく、旧t_eventsとそれを参照するnotification_send_logsを作成し、
// eventsへの変換後も通知ログの参照が維持されることを確認する。
const TRANSFORM_STATEMENTS = [
  `INSERT OR IGNORE INTO users (user_id, user_name, is_live_active) VALUES (-1, 'システム移行ユーザー', 0)`,
  `ALTER TABLE t_events RENAME TO t_events_legacy`,
  `CREATE TABLE events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(user_id), event_name TEXT NOT NULL, rule_text TEXT, venue TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `INSERT INTO events (event_id, user_id, event_name, rule_text, venue, start_time, end_time) SELECT f_event_id, -1, f_event_name, f_summary, f_place, f_time, strftime('%H%M', time(substr(f_time, 1, 2) || ':' || substr(f_time, 3, 2), '+' || f_duration || ' minutes')) FROM t_events_legacy`,
  `CREATE TABLE notification_send_logs_new (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES events(event_id), firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(id), notification_type TEXT NOT NULL, scheduled_for_date TEXT NOT NULL, fcm_message_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date))`,
  `INSERT INTO notification_send_logs_new (id, event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id, created_at) SELECT id, event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id, created_at FROM notification_send_logs`,
  `DROP TABLE notification_send_logs`,
  `ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs`,
  `CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)`,
  `CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)`,
  `DROP TABLE t_events_legacy`,
];

async function runTransform() {
  await env.DB.batch(TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql)));
}

async function prepareLegacySchema() {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_send_logs_event_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_send_logs RENAME TO notification_send_logs_backup'
    ),
    env.DB.prepare('ALTER TABLE events RENAME TO events_backup'),
    env.DB.prepare(
      'CREATE TABLE t_events (f_event_id INTEGER PRIMARY KEY AUTOINCREMENT, f_event_code TEXT NOT NULL UNIQUE, f_event_name TEXT NOT NULL, f_time TEXT NOT NULL, f_duration TEXT NOT NULL, f_place TEXT NOT NULL, f_gather_time TEXT NOT NULL, f_summary TEXT)'
    ),
    env.DB.prepare(
      'CREATE TABLE notification_send_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL REFERENCES t_events(f_event_id), firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(id), notification_type TEXT NOT NULL, scheduled_for_date TEXT NOT NULL, fcm_message_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date))'
    ),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS notification_send_logs'),
    env.DB.prepare('DROP TABLE IF EXISTS events'),
    env.DB.prepare('DROP TABLE IF EXISTS t_events'),
    env.DB.prepare('DROP TABLE IF EXISTS t_events_legacy'),
    env.DB.prepare('ALTER TABLE events_backup RENAME TO events'),
    env.DB.prepare(
      'ALTER TABLE notification_send_logs_backup RENAME TO notification_send_logs'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date)'
    ),
  ]);
}

describe('0013_migrate_events_to_ideal_schema.sql のデータ変換', () => {
  const studentNumber = 'MIG013-001';
  const fcmToken = 'migration-test-token-0013';

  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare('DELETE FROM firebase_tokens WHERE fcm_token = ?')
      .bind(fcmToken)
      .run();
    await env.DB.prepare('DELETE FROM auth_users WHERE student_number = ?')
      .bind(studentNumber)
      .run();
  });

  it('イベント、日跨ぎの終了時刻、通知送信ログの参照先を維持して移行する', async () => {
    await prepareLegacySchema();

    const authUser = await env.DB.prepare(
      'INSERT INTO auth_users (student_number) VALUES (?) RETURNING id'
    )
      .bind(studentNumber)
      .first<{ id: number }>();
    const firebaseToken = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, ?, ?) RETURNING id'
    )
      .bind(authUser!.id, 'ios', fcmToken)
      .first<{ id: number }>();

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO t_events (f_event_id, f_event_code, f_event_name, f_time, f_duration, f_place, f_gather_time, f_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        930001,
        'MIG-013-001',
        '日跨ぎ移行イベント',
        '2345',
        '30',
        'テスト会場',
        '2330',
        '移行ルール'
      ),
      env.DB.prepare(
        'INSERT INTO notification_send_logs (event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(930001, firebaseToken!.id, 'start', '2026-07-15', 'fcm-0013'),
    ]);

    await runTransform();

    const event = await env.DB.prepare(
      'SELECT event_id, user_id, event_name, rule_text, venue, start_time, end_time FROM events WHERE event_id = ?'
    )
      .bind(930001)
      .first();
    expect(event).toEqual({
      event_id: 930001,
      user_id: -1,
      event_name: '日跨ぎ移行イベント',
      rule_text: '移行ルール',
      venue: 'テスト会場',
      start_time: '2345',
      end_time: '0015',
    });

    const notificationLog = await env.DB.prepare(
      'SELECT event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id FROM notification_send_logs WHERE event_id = ?'
    )
      .bind(930001)
      .first();
    expect(notificationLog).toEqual({
      event_id: 930001,
      firebase_token_id: firebaseToken!.id,
      notification_type: 'start',
      scheduled_for_date: '2026-07-15',
      fcm_message_id: 'fcm-0013',
    });

    const legacyTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 't_events'"
    ).first();
    expect(legacyTable).toBeNull();

    const foreignKeyErrors = await env.DB.prepare('PRAGMA foreign_key_check').all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
