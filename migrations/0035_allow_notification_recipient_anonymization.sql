-- 通知v2のRecipientを匿名化後も保持できるよう、User FKを変更する。
-- Recipientを参照するDeliveryも再作成し、既存の履歴とIDを維持する。

CREATE TABLE __migration_0035_sequences (
  notification_recipients_seq INTEGER NOT NULL,
  notification_push_deliveries_seq INTEGER NOT NULL
);

INSERT INTO __migration_0035_sequences
SELECT
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_recipients'), 0),
  COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'notification_push_deliveries'), 0);

DROP INDEX IF EXISTS uq_notification_recipients_schedule_user;
DROP INDEX IF EXISTS idx_notification_recipients_user_id;
DROP INDEX IF EXISTS uq_notification_push_deliveries_recipient_token;
DROP INDEX IF EXISTS idx_notification_push_deliveries_firebase_token_id;
DROP INDEX IF EXISTS idx_notification_push_deliveries_retry;

-- 先に子Tableを退避し、RecipientのFKを安全に張り替える。
ALTER TABLE notification_push_deliveries
  RENAME TO __migration_0035_notification_push_deliveries;
ALTER TABLE notification_recipients
  RENAME TO __migration_0035_notification_recipients;

CREATE TABLE notification_recipients (
  notification_recipient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_schedule_id INTEGER NOT NULL
    REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
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

INSERT INTO notification_recipients (
  notification_recipient_id, notification_schedule_id, user_id, created_at
)
SELECT
  notification_recipient_id, notification_schedule_id, user_id, created_at
FROM __migration_0035_notification_recipients;

INSERT INTO notification_push_deliveries (
  notification_push_delivery_id, notification_recipient_id, firebase_token_id,
  platform, status, attempt_count, first_attempt_at, last_attempt_at,
  next_retry_at, failed_reason, fcm_message_id, sent_at, created_at, updated_at
)
SELECT
  notification_push_delivery_id, notification_recipient_id, firebase_token_id,
  platform, status, attempt_count, first_attempt_at, last_attempt_at,
  next_retry_at, failed_reason, fcm_message_id, sent_at, created_at, updated_at
FROM __migration_0035_notification_push_deliveries;

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

DROP TABLE __migration_0035_notification_push_deliveries;
DROP TABLE __migration_0035_notification_recipients;

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_recipients_seq FROM __migration_0035_sequences)
)
WHERE name = 'notification_recipients';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_recipients', notification_recipients_seq
FROM __migration_0035_sequences
WHERE notification_recipients_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_recipients'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_push_deliveries_seq FROM __migration_0035_sequences)
)
WHERE name = 'notification_push_deliveries';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_push_deliveries', notification_push_deliveries_seq
FROM __migration_0035_sequences
WHERE notification_push_deliveries_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_push_deliveries'
  );

DROP TABLE __migration_0035_sequences;
