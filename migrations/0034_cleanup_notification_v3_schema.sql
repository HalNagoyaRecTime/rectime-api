-- 通知基盤v2のcutover後にexpand互換列を削除するforward migration。
-- 既存の通知履歴、Recipient、Push DeliveryのIDと件数を保持する。

CREATE TABLE __cleanup_notification_sequences (
  table_name TEXT PRIMARY KEY,
  sequence_value INTEGER NOT NULL
);

INSERT INTO __cleanup_notification_sequences (table_name, sequence_value)
SELECT name, seq
FROM sqlite_sequence
WHERE name IN (
  'notifications',
  'notification_schedules',
  'firebase_tokens',
  'notification_audiences',
  'notification_recipients',
  'notification_push_deliveries'
);

CREATE TABLE __cleanup_token_map (
  old_firebase_token_id INTEGER PRIMARY KEY,
  new_firebase_token_id INTEGER NOT NULL
);

INSERT INTO __cleanup_token_map (
  old_firebase_token_id,
  new_firebase_token_id
)
SELECT
  old.firebase_token_id,
  MIN(retained.firebase_token_id)
FROM firebase_tokens old
INNER JOIN firebase_tokens retained
  ON retained.fcm_token = old.fcm_token
GROUP BY old.firebase_token_id;

CREATE TABLE __cleanup_firebase_tokens (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  fcm_token TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO __cleanup_firebase_tokens (
  firebase_token_id,
  user_id,
  platform,
  fcm_token,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  firebase_token_id,
  user_id,
  platform,
  fcm_token,
  last_seen_at,
  created_at,
  updated_at
FROM firebase_tokens
WHERE firebase_token_id IN (
  SELECT MIN(firebase_token_id)
  FROM firebase_tokens
  GROUP BY fcm_token
);

CREATE TABLE __cleanup_notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  push_title TEXT NOT NULL,
  push_body TEXT NOT NULL,
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

INSERT INTO __cleanup_notifications (
  notification_id,
  created_by_user_id,
  push_title,
  push_body,
  importance,
  notification_type,
  source_type,
  source_id,
  source_hash,
  created_at,
  updated_at
)
SELECT
  notification_id,
  created_by_user_id,
  CASE WHEN push_title = '' THEN title ELSE push_title END,
  CASE WHEN push_body = '' THEN body ELSE push_body END,
  importance,
  notification_type,
  source_type,
  source_id,
  source_hash,
  created_at,
  updated_at
FROM notifications;

CREATE TABLE __cleanup_notification_schedules (
  notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  notification_id INTEGER NOT NULL
    REFERENCES __cleanup_notifications(notification_id) ON DELETE CASCADE,
  send_status TEXT NOT NULL,
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

INSERT INTO __cleanup_notification_schedules (
  notification_schedule_id,
  scheduled_by_user_id,
  notification_id,
  send_status,
  send_at,
  recipients_resolved_at,
  started_at,
  completed_at,
  stopped_at,
  stopped_by_user_id,
  reason,
  created_at,
  updated_at
)
SELECT
  notification_schedule_id,
  scheduled_by_user_id,
  notification_id,
  CASE WHEN send_status = 'draft' THEN 'scheduled' ELSE send_status END,
  send_at,
  recipients_resolved_at,
  started_at,
  completed_at,
  stopped_at,
  stopped_by_user_id,
  reason,
  created_at,
  updated_at
FROM notification_schedules;

CREATE TABLE __cleanup_notification_audiences (
  notification_audience_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES __cleanup_notification_schedules(notification_schedule_id)
    ON DELETE CASCADE,
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

INSERT INTO __cleanup_notification_audiences (
  notification_audience_id,
  notification_schedule_id,
  audience_type,
  target_id,
  resolved_at,
  created_at,
  updated_at
)
SELECT
  notification_audience_id,
  notification_schedule_id,
  audience_type,
  target_id,
  resolved_at,
  created_at,
  updated_at
FROM notification_audiences;

CREATE TABLE __cleanup_notification_recipients (
  notification_recipient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES __cleanup_notification_schedules(notification_schedule_id)
    ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO __cleanup_notification_recipients (
  notification_recipient_id,
  notification_schedule_id,
  user_id,
  created_at
)
SELECT
  notification_recipient_id,
  notification_schedule_id,
  user_id,
  created_at
FROM notification_recipients;

CREATE TABLE __cleanup_notification_push_deliveries (
  notification_push_delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_recipient_id INTEGER NOT NULL
    REFERENCES __cleanup_notification_recipients(notification_recipient_id)
    ON DELETE CASCADE,
  firebase_token_id INTEGER REFERENCES __cleanup_firebase_tokens(firebase_token_id)
    ON DELETE SET NULL,
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

INSERT INTO __cleanup_notification_push_deliveries (
  notification_push_delivery_id,
  notification_recipient_id,
  firebase_token_id,
  platform,
  status,
  attempt_count,
  first_attempt_at,
  last_attempt_at,
  next_retry_at,
  failed_reason,
  fcm_message_id,
  sent_at,
  created_at,
  updated_at
)
SELECT
  d.notification_push_delivery_id,
  d.notification_recipient_id,
  token_map.new_firebase_token_id,
  d.platform,
  d.status,
  d.attempt_count,
  d.first_attempt_at,
  d.last_attempt_at,
  d.next_retry_at,
  d.failed_reason,
  d.fcm_message_id,
  d.sent_at,
  d.created_at,
  d.updated_at
FROM notification_push_deliveries d
LEFT JOIN __cleanup_token_map token_map
  ON token_map.old_firebase_token_id = d.firebase_token_id;

DROP TABLE notification_push_deliveries;
DROP TABLE notification_recipients;
DROP TABLE notification_audiences;
DROP TABLE notification_schedules;
DROP TABLE notifications;
DROP TABLE firebase_tokens;

ALTER TABLE __cleanup_notifications RENAME TO notifications;
ALTER TABLE __cleanup_firebase_tokens RENAME TO firebase_tokens;
ALTER TABLE __cleanup_notification_schedules RENAME TO notification_schedules;
ALTER TABLE __cleanup_notification_audiences RENAME TO notification_audiences;
ALTER TABLE __cleanup_notification_recipients RENAME TO notification_recipients;
ALTER TABLE __cleanup_notification_push_deliveries
  RENAME TO notification_push_deliveries;

CREATE UNIQUE INDEX uq_firebase_tokens_fcm_token
  ON firebase_tokens(fcm_token);
CREATE UNIQUE INDEX uq_notifications_source
  ON notifications(source_type, source_id, notification_type, source_hash);
CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
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
CREATE INDEX idx_notification_push_deliveries_retry
  ON notification_push_deliveries(status, next_retry_at);

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'notifications'
    ),
    0
  )
)
WHERE name = 'notifications';

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'firebase_tokens'
    ),
    0
  )
)
WHERE name = 'firebase_tokens';

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'notification_schedules'
    ),
    0
  )
)
WHERE name = 'notification_schedules';

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'notification_audiences'
    ),
    0
  )
)
WHERE name = 'notification_audiences';

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'notification_recipients'
    ),
    0
  )
)
WHERE name = 'notification_recipients';

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  COALESCE(
    (
      SELECT sequence_value
      FROM __cleanup_notification_sequences
      WHERE table_name = 'notification_push_deliveries'
    ),
    0
  )
)
WHERE name = 'notification_push_deliveries';

DROP TABLE __cleanup_token_map;
DROP TABLE __cleanup_notification_sequences;
