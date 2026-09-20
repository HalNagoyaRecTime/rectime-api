-- 通知v3のexpand migration。
-- 既存の通知経路が参照する列はcleanup phaseまで残し、新しい論理配信単位を追加する。

CREATE TABLE __migration_0033_schedule_rows AS
SELECT * FROM notification_schedules;

CREATE TABLE __migration_0033_token_rows AS
SELECT * FROM firebase_tokens;

CREATE TABLE __migration_0033_notification_rows AS
SELECT * FROM notifications;

CREATE TABLE __migration_0033_sequences (
  notifications_seq INTEGER NOT NULL,
  notification_schedules_seq INTEGER NOT NULL,
  firebase_tokens_seq INTEGER NOT NULL
);

INSERT INTO __migration_0033_sequences (
  notifications_seq,
  notification_schedules_seq,
  firebase_tokens_seq
)
SELECT
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notifications'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_schedules'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'firebase_tokens'), 0);

DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token;
DROP INDEX IF EXISTS idx_firebase_tokens_active;
DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS idx_notification_schedules_due;
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_notification_id;
DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id;

DROP TABLE notification_schedules;
DROP TABLE firebase_tokens;
DROP TABLE notifications;

CREATE TABLE firebase_tokens (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  fcm_token TEXT NOT NULL,
  -- 旧Workerとのexpand互換用。#460でactive flagを削除する。
  is_firebase_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO firebase_tokens (
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
  firebase_token_id,
  user_id,
  platform,
  fcm_token,
  is_firebase_active,
  last_seen_at,
  created_at,
  updated_at
FROM __migration_0033_token_rows;

CREATE INDEX idx_firebase_tokens_active
  ON firebase_tokens(is_firebase_active);
-- active flagを参照する旧コードを壊さないため、#460まではpartial uniqueを維持する。
CREATE UNIQUE INDEX idx_firebase_tokens_active_fcm_token
  ON firebase_tokens(fcm_token)
  WHERE is_firebase_active = 1;

CREATE TABLE notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  push_title TEXT NOT NULL DEFAULT '',
  push_body TEXT NOT NULL DEFAULT '',
  -- title/bodyは旧Mobile・旧Admin経路とのexpand互換用。#460で削除する。
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 2,
  notification_type TEXT NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  source_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (source_type IS NULL AND source_id IS NULL AND source_hash IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL AND source_hash IS NOT NULL)
  )
);

INSERT INTO notifications (
  notification_id,
  created_by_user_id,
  push_title,
  push_body,
  title,
  body,
  importance,
  notification_type,
  created_at,
  updated_at
)
SELECT
  n.notification_id,
  (
    SELECT s.created_user_id
    FROM __migration_0033_schedule_rows s
    WHERE s.notification_id = n.notification_id
      AND s.created_user_id IS NOT NULL
    ORDER BY s.notification_schedule_id
    LIMIT 1
  ),
  n.title,
  n.body,
  n.title,
  n.body,
  COALESCE(
    (
      SELECT s.importance
      FROM __migration_0033_schedule_rows s
      WHERE s.notification_id = n.notification_id
      ORDER BY s.notification_schedule_id
      LIMIT 1
    ),
    2
  ),
  n.notification_type,
  n.created_at,
  n.updated_at
FROM __migration_0033_notification_rows n;

CREATE UNIQUE INDEX uq_notifications_source
  ON notifications(source_type, source_id, notification_type, source_hash);

CREATE TABLE notification_schedules (
  notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  scheduled_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(event_id) ON DELETE SET NULL,
  notification_id INTEGER NOT NULL
    REFERENCES notifications(notification_id) ON DELETE CASCADE,
  -- 旧Token単位Scheduleとのexpand互換用。v3ではNULLを許容する。
  firebase_token_id INTEGER REFERENCES firebase_tokens(firebase_token_id) ON DELETE SET NULL,
  importance INTEGER NOT NULL DEFAULT 2,
  -- 旧Workerとのexpand互換用。#460でdefaultと旧statusを整理する。
  send_status TEXT NOT NULL DEFAULT 'draft',
  fcm_message_id TEXT,
  failed_reason TEXT,
  send_at TEXT NOT NULL,
  recipients_resolved_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  stopped_at TEXT,
  stopped_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notification_schedules (
  notification_schedule_id,
  created_user_id,
  event_id,
  notification_id,
  firebase_token_id,
  importance,
  send_status,
  fcm_message_id,
  failed_reason,
  send_at,
  created_at,
  updated_at
)
SELECT
  notification_schedule_id,
  created_user_id,
  event_id,
  notification_id,
  firebase_token_id,
  importance,
  send_status,
  fcm_message_id,
  failed_reason,
  send_at,
  created_at,
  updated_at
FROM __migration_0033_schedule_rows;

CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
CREATE INDEX idx_notification_schedules_firebase_token_id
  ON notification_schedules(firebase_token_id);

CREATE TABLE notification_audiences (
  notification_audience_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL,
  target_id INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (audience_type = 'all' AND target_id IS NULL)
    OR (audience_type <> 'all' AND target_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_notification_audiences_schedule_target
  ON notification_audiences(notification_schedule_id, audience_type, target_id);

CREATE UNIQUE INDEX uq_notification_audiences_schedule_all
  ON notification_audiences(notification_schedule_id)
  WHERE audience_type = 'all';

CREATE TABLE notification_recipients (
  notification_recipient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_notification_recipients_schedule_user
  ON notification_recipients(notification_schedule_id, user_id);

CREATE INDEX idx_notification_recipients_user_id
  ON notification_recipients(user_id);

CREATE TABLE notification_push_deliveries (
  notification_push_delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_recipient_id INTEGER NOT NULL
    REFERENCES notification_recipients(notification_recipient_id) ON DELETE CASCADE,
  firebase_token_id INTEGER REFERENCES firebase_tokens(firebase_token_id) ON DELETE SET NULL,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  failed_reason TEXT,
  fcm_message_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_notification_push_deliveries_recipient_token
  ON notification_push_deliveries(notification_recipient_id, firebase_token_id)
  WHERE firebase_token_id IS NOT NULL;

CREATE INDEX idx_notification_push_deliveries_retry
  ON notification_push_deliveries(status, next_retry_at);

-- DROP/CREATEで失われたAUTOINCREMENTの高水位を復元する。
UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT notifications_seq FROM __migration_0033_sequences))
WHERE name = 'notifications';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'notifications', notifications_seq
FROM __migration_0033_sequences
WHERE notifications_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'notifications');

UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT notification_schedules_seq FROM __migration_0033_sequences))
WHERE name = 'notification_schedules';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_schedules', notification_schedules_seq
FROM __migration_0033_sequences
WHERE notification_schedules_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'notification_schedules');

UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT firebase_tokens_seq FROM __migration_0033_sequences))
WHERE name = 'firebase_tokens';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'firebase_tokens', firebase_tokens_seq
FROM __migration_0033_sequences
WHERE firebase_tokens_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'firebase_tokens');

DROP TABLE __migration_0033_schedule_rows;
DROP TABLE __migration_0033_token_rows;
DROP TABLE __migration_0033_notification_rows;
DROP TABLE __migration_0033_sequences;
