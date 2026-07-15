-- 既存イベントの変更者が保存されていないため、移行データ専用ユーザーへ紐付ける。
INSERT OR IGNORE INTO users (user_id, user_name, is_live_active)
VALUES (-1, 'システム移行ユーザー', 0);

ALTER TABLE t_events RENAME TO t_events_legacy;

CREATE TABLE events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  event_name TEXT NOT NULL,
  rule_text TEXT,
  venue TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO events (event_id, user_id, event_name, rule_text, venue, start_time, end_time)
SELECT
  f_event_id,
  -1,
  f_event_name,
  f_summary,
  f_place,
  f_time,
  strftime('%H%M', time(substr(f_time, 1, 2) || ':' || substr(f_time, 3, 2), '+' || f_duration || ' minutes'))
FROM t_events_legacy;

CREATE TABLE notification_send_logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(id),
  notification_type TEXT NOT NULL,
  scheduled_for_date TEXT NOT NULL,
  fcm_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, firebase_token_id, notification_type, scheduled_for_date)
);

INSERT INTO notification_send_logs_new (id, event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id, created_at)
SELECT id, event_id, firebase_token_id, notification_type, scheduled_for_date, fcm_message_id, created_at
FROM notification_send_logs;

DROP TABLE notification_send_logs;
ALTER TABLE notification_send_logs_new RENAME TO notification_send_logs;
CREATE INDEX idx_notification_send_logs_event_id ON notification_send_logs(event_id);
CREATE INDEX idx_notification_send_logs_scheduled_for_date ON notification_send_logs(scheduled_for_date);

DROP TABLE t_events_legacy;
