-- auth_users にのみ存在し、students から users へ辿れないFirebaseトークンは
-- 新スキーマへ対応付けられない。削除による通知先の喪失を避けるため、
-- 不整合を検知した時点で以降のmigrationを中断する。
CREATE TABLE __migration_0017_guard (
  unmatched_token_count INTEGER CHECK (unmatched_token_count = 0)
);

INSERT INTO __migration_0017_guard (unmatched_token_count)
SELECT COUNT(*)
FROM firebase_tokens ft
LEFT JOIN auth_users au ON au.id = ft.user_id
LEFT JOIN students s ON s.student_id_number = au.student_number
WHERE au.id IS NULL OR s.user_id IS NULL;

DROP TABLE __migration_0017_guard;

-- firebase_tokens の参照先を auth_users(id) から users(user_id) へ変更する。
-- notification_send_logs はfirebase_tokensの主キーを参照するため、同時に再作成する。
ALTER TABLE notification_send_logs RENAME TO notification_send_logs_legacy;
ALTER TABLE firebase_tokens RENAME TO firebase_tokens_legacy;

DROP INDEX IF EXISTS idx_notification_send_logs_event_id;
DROP INDEX IF EXISTS idx_notification_send_logs_scheduled_for_date;
DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS idx_firebase_tokens_active;

CREATE TABLE firebase_tokens_new (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
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
  ft.firebase_token_id,
  s.user_id,
  ft.platform,
  ft.fcm_token,
  ft.is_firebase_active,
  ft.last_seen_at,
  ft.created_at,
  ft.updated_at
FROM firebase_tokens_legacy ft
INNER JOIN auth_users au ON au.id = ft.user_id
INNER JOIN students s ON s.student_id_number = au.student_number;

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
DROP TABLE auth_users;

ALTER TABLE firebase_tokens_new RENAME TO firebase_tokens;
ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs;

CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id);
CREATE INDEX idx_firebase_tokens_active
  ON firebase_tokens(is_firebase_active);
CREATE INDEX idx_notification_send_logs_event_id
  ON notification_send_logs(event_id);
CREATE INDEX idx_notification_send_logs_scheduled_for_date
  ON notification_send_logs(scheduled_for_date);
