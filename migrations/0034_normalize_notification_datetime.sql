-- 通知v2の6テーブルだけ日時保存形式をUTC ISO 8601へ統一する。
-- 既存のSQLite CURRENT_TIMESTAMP形式やoffset付きISO日時も、
-- YYYY-MM-DDTHH:mm:ss.sssZ へ正規化して引き継ぐ。

CREATE TABLE __migration_0034_sequences (
  notifications_seq INTEGER NOT NULL,
  firebase_tokens_seq INTEGER NOT NULL,
  notification_schedules_seq INTEGER NOT NULL,
  notification_audiences_seq INTEGER NOT NULL,
  notification_recipients_seq INTEGER NOT NULL,
  notification_push_deliveries_seq INTEGER NOT NULL
);

INSERT INTO __migration_0034_sequences
SELECT
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notifications'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'firebase_tokens'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_schedules'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_audiences'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_recipients'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_push_deliveries'), 0);

DROP INDEX IF EXISTS uq_notifications_source;
DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS uq_firebase_tokens_fcm_token;
DROP INDEX IF EXISTS idx_firebase_tokens_active;
DROP INDEX IF EXISTS idx_notification_schedules_due;
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_notification_id;
DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id;
DROP INDEX IF EXISTS uq_notification_audiences_schedule_target;
DROP INDEX IF EXISTS uq_notification_audiences_schedule_all;
DROP INDEX IF EXISTS uq_notification_recipients_schedule_user;
DROP INDEX IF EXISTS idx_notification_recipients_user_id;
DROP INDEX IF EXISTS uq_notification_push_deliveries_recipient_token;
DROP INDEX IF EXISTS idx_notification_push_deliveries_firebase_token_id;
DROP INDEX IF EXISTS idx_notification_push_deliveries_retry;

ALTER TABLE notification_push_deliveries
  RENAME TO __migration_0034_notification_push_deliveries;
ALTER TABLE notification_recipients
  RENAME TO __migration_0034_notification_recipients;
ALTER TABLE notification_audiences
  RENAME TO __migration_0034_notification_audiences;
ALTER TABLE notification_schedules
  RENAME TO __migration_0034_notification_schedules;
ALTER TABLE firebase_tokens
  RENAME TO __migration_0034_firebase_tokens;
ALTER TABLE notifications
  RENAME TO __migration_0034_notifications;

CREATE TABLE notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  push_title TEXT NOT NULL,
  push_body TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'normal',
  source_type TEXT,
  source_id INTEGER,
  source_hash TEXT,
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (importance IN ('low', 'normal', 'high')),
  CHECK (
    (
      source_type IS NULL
      AND source_id IS NULL
      AND source_hash IS NULL
    )
    OR (
      source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND source_hash IS NOT NULL
    )
  )
);

CREATE TABLE firebase_tokens (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  fcm_token TEXT NOT NULL,
  is_firebase_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notification_schedules (
  notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  scheduled_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(event_id) ON DELETE SET NULL,
  notification_id INTEGER NOT NULL REFERENCES notifications(notification_id),
  firebase_token_id INTEGER REFERENCES firebase_tokens(firebase_token_id)
    ON DELETE SET NULL,
  importance INTEGER NOT NULL DEFAULT 2,
  send_status TEXT NOT NULL,
  fcm_message_id TEXT,
  failed_reason TEXT,
  send_at TEXT NOT NULL,
  recipients_resolved_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  stopped_at TEXT,
  stopped_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT,
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notification_audiences (
  notification_audience_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL,
  target_id INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    audience_type IN ('all', 'class_room', 'gathering', 'event', 'user')
    AND (
      (audience_type = 'all' AND target_id IS NULL)
      OR (audience_type <> 'all' AND target_id IS NOT NULL)
    )
  )
);

CREATE TABLE notification_recipients (
  notification_recipient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notification_push_deliveries (
  notification_push_delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_recipient_id INTEGER NOT NULL
    REFERENCES notification_recipients(notification_recipient_id) ON DELETE CASCADE,
  firebase_token_id INTEGER REFERENCES firebase_tokens(firebase_token_id)
    ON DELETE SET NULL,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  first_attempt_at TEXT,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  failed_reason TEXT,
  fcm_message_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO notifications (
  notification_id, created_by_user_id, push_title, push_body,
  notification_type, title, body, importance,
  source_type, source_id, source_hash, created_at, updated_at
)
SELECT
  notification_id, created_by_user_id, push_title, push_body,
  notification_type, title, body, importance,
  source_type, source_id, source_hash,
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
FROM __migration_0034_notifications;

INSERT INTO firebase_tokens (
  firebase_token_id, user_id, platform, fcm_token, is_firebase_active,
  last_seen_at, created_at, updated_at
)
SELECT
  firebase_token_id, user_id, platform, fcm_token, is_firebase_active,
  strftime('%Y-%m-%dT%H:%M:%fZ', last_seen_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
FROM __migration_0034_firebase_tokens;

INSERT INTO notification_schedules (
  notification_schedule_id, created_user_id, scheduled_by_user_id, event_id,
  notification_id, firebase_token_id, importance, send_status,
  fcm_message_id, failed_reason, send_at, recipients_resolved_at,
  started_at, completed_at, stopped_at, stopped_by_user_id, reason,
  created_at, updated_at
)
SELECT
  notification_schedule_id, created_user_id, scheduled_by_user_id, event_id,
  notification_id, firebase_token_id, importance, send_status,
  fcm_message_id, failed_reason,
  strftime('%Y-%m-%dT%H:%M:%fZ', send_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', recipients_resolved_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', started_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', completed_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', stopped_at),
  stopped_by_user_id, reason,
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
FROM __migration_0034_notification_schedules;

INSERT INTO notification_audiences (
  notification_audience_id, notification_schedule_id, audience_type,
  target_id, resolved_at, created_at, updated_at
)
SELECT
  notification_audience_id, notification_schedule_id, audience_type,
  target_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', resolved_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
FROM __migration_0034_notification_audiences;

INSERT INTO notification_recipients (
  notification_recipient_id, notification_schedule_id, user_id, created_at
)
SELECT
  notification_recipient_id, notification_schedule_id, user_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at)
FROM __migration_0034_notification_recipients;

INSERT INTO notification_push_deliveries (
  notification_push_delivery_id, notification_recipient_id, firebase_token_id,
  platform, status, attempt_count, first_attempt_at, last_attempt_at,
  next_retry_at, failed_reason, fcm_message_id, sent_at, created_at, updated_at
)
SELECT
  notification_push_delivery_id, notification_recipient_id, firebase_token_id,
  platform, status, attempt_count,
  strftime('%Y-%m-%dT%H:%M:%fZ', first_attempt_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', last_attempt_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', next_retry_at),
  failed_reason, fcm_message_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', sent_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)
FROM __migration_0034_notification_push_deliveries;

CREATE UNIQUE INDEX uq_notifications_source
  ON notifications(source_type, source_id, notification_type, source_hash);
CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id);
CREATE UNIQUE INDEX uq_firebase_tokens_fcm_token ON firebase_tokens(fcm_token);
CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active);
CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
CREATE INDEX idx_notification_schedules_firebase_token_id
  ON notification_schedules(firebase_token_id);
CREATE UNIQUE INDEX uq_notification_audiences_schedule_target
  ON notification_audiences(notification_schedule_id, audience_type, target_id);
CREATE UNIQUE INDEX uq_notification_audiences_schedule_all
  ON notification_audiences(notification_schedule_id)
  WHERE audience_type = 'all';
CREATE UNIQUE INDEX uq_notification_recipients_schedule_user
  ON notification_recipients(notification_schedule_id, user_id);
CREATE INDEX idx_notification_recipients_user_id
  ON notification_recipients(user_id);
CREATE UNIQUE INDEX uq_notification_push_deliveries_recipient_token
  ON notification_push_deliveries(notification_recipient_id, firebase_token_id)
  WHERE firebase_token_id IS NOT NULL;
CREATE INDEX idx_notification_push_deliveries_firebase_token_id
  ON notification_push_deliveries(firebase_token_id);
CREATE INDEX idx_notification_push_deliveries_retry
  ON notification_push_deliveries(status, next_retry_at);

DROP TABLE __migration_0034_notification_push_deliveries;
DROP TABLE __migration_0034_notification_recipients;
DROP TABLE __migration_0034_notification_audiences;
DROP TABLE __migration_0034_notification_schedules;
DROP TABLE __migration_0034_firebase_tokens;
DROP TABLE __migration_0034_notifications;

UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT notifications_seq FROM __migration_0034_sequences))
WHERE name = 'notifications';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notifications', notifications_seq
FROM __migration_0034_sequences
WHERE notifications_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'notifications');

UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT firebase_tokens_seq FROM __migration_0034_sequences))
WHERE name = 'firebase_tokens';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'firebase_tokens', firebase_tokens_seq
FROM __migration_0034_sequences
WHERE firebase_tokens_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'firebase_tokens');

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_schedules_seq FROM __migration_0034_sequences)
)
WHERE name = 'notification_schedules';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_schedules', notification_schedules_seq
FROM __migration_0034_sequences
WHERE notification_schedules_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_schedules'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_audiences_seq FROM __migration_0034_sequences)
)
WHERE name = 'notification_audiences';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_audiences', notification_audiences_seq
FROM __migration_0034_sequences
WHERE notification_audiences_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_audiences'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_recipients_seq FROM __migration_0034_sequences)
)
WHERE name = 'notification_recipients';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_recipients', notification_recipients_seq
FROM __migration_0034_sequences
WHERE notification_recipients_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_recipients'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_push_deliveries_seq FROM __migration_0034_sequences)
)
WHERE name = 'notification_push_deliveries';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_push_deliveries', notification_push_deliveries_seq
FROM __migration_0034_sequences
WHERE notification_push_deliveries_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_push_deliveries'
  );

DROP TABLE __migration_0034_sequences;
