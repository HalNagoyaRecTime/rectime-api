-- notification_send_logs は firebase_tokens の主キーを参照しているため、
-- 両テーブルを退避してから新しい主キー名で再作成する。
ALTER TABLE notification_send_logs RENAME TO notification_send_logs_legacy;
ALTER TABLE firebase_tokens RENAME TO firebase_tokens_legacy;

-- ALTER TABLE ... RENAME ではインデックス名は変わらないため、
-- 新テーブルに同名インデックスを作成できるよう旧テーブル側を削除する。
DROP INDEX IF EXISTS idx_notification_send_logs_event_id;
DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date;
DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS idx_firebase_tokens_active;

CREATE TABLE firebase_tokens_new (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES auth_users(id),
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  fcm_token TEXT NOT NULL UNIQUE,
  is_firebase_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO firebase_tokens_new (
  firebase_token_id,
  user_id,
  platform,
  fcm_token,
  is_firebase_active,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  CASE lower(platform)
    WHEN 'ios' THEN 1
    WHEN 'android' THEN 2
    WHEN '1' THEN 1
    WHEN '2' THEN 2
  END,
  fcm_token,
  is_active,
  last_seen_at,
  created_at,
  updated_at
FROM firebase_tokens_legacy;

CREATE TABLE notification_send_logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens_new(firebase_token_id),
  notification_type TEXT NOT NULL,
  scheduled_for_date TEXT NOT NULL,
  fcm_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date)
);

INSERT INTO notification_send_logs_new (
  id,
  event_id,
  firebase_token_id,
  notification_type,
  scheduled_for_date,
  fcm_message_id,
  created_at
)
SELECT
  id,
  event_id,
  firebase_token_id,
  notification_type,
  scheduled_for_date,
  fcm_message_id,
  created_at
FROM notification_send_logs_legacy;

DROP TABLE notification_send_logs_legacy;
DROP TABLE firebase_tokens_legacy;

ALTER TABLE firebase_tokens_new RENAME TO firebase_tokens;
ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs;

CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id);
CREATE INDEX idx_firebase_tokens_active
  ON firebase_tokens(is_firebase_active);
CREATE INDEX idx_notification_send_logs_event_id
  ON notification_send_logs(event_id);
CREATE INDEX idx_notification_send_logs_scheduled_for_date
  ON notification_send_logs(scheduled_for_date);

ALTER TABLE notifications RENAME TO notifications_legacy;

CREATE TABLE notifications_new (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notifications_new (
  notification_id,
  notification_type,
  title,
  body,
  created_at,
  updated_at
)
SELECT
  id,
  type,
  title,
  body,
  created_at,
  created_at
FROM notifications_legacy;

DROP TABLE notifications_legacy;
ALTER TABLE notifications_new RENAME TO notifications;
