-- 通知v2のDB基盤を追加するforward migration。
-- 既存の通知履歴はLegacy行として保持し、Audience/Recipient/Deliveryへ変換しない。

-- firebase_tokensはuser_idのUNIQUEを解除し、fcm_tokenは完全UNIQUEへ戻すため再作成する。
-- active flagとLegacy indexは旧Repository互換のため#460まで残す。
-- notification_schedulesもfirebase_token_idをNULL許容にするため同時に再作成する。
CREATE TABLE __migration_0033_sequences (
  notifications_seq INTEGER NOT NULL,
  firebase_tokens_seq INTEGER NOT NULL,
  notification_schedules_seq INTEGER NOT NULL
);

INSERT INTO __migration_0033_sequences (
  notifications_seq,
  firebase_tokens_seq,
  notification_schedules_seq
)
SELECT
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'notifications'),
    0
  ),
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'firebase_tokens'),
    0
  ),
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'notification_schedules'),
    0
  );

DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token;
DROP INDEX IF EXISTS idx_firebase_tokens_active;
DROP INDEX IF EXISTS idx_notification_schedules_due;
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_notification_id;
DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id;

ALTER TABLE notification_schedules
  RENAME TO __migration_0033_notification_schedules;
ALTER TABLE firebase_tokens
  RENAME TO __migration_0033_firebase_tokens;
ALTER TABLE notifications
  RENAME TO __migration_0033_notifications;

-- source情報は3項目すべてNULL、または3項目すべて値ありだけを許可する。
-- SQLiteでは既存tableへCHECKを追加できないため、notificationsだけ最終形で再作成する。
CREATE TABLE notifications (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  push_title TEXT NOT NULL DEFAULT '',
  push_body TEXT NOT NULL DEFAULT '',
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'normal',
  source_type TEXT,
  source_id INTEGER,
  source_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

-- Legacy Notificationは意味変換せず、既存の表示内容をPush初期値にも使う。
-- v2専用の作成者・source情報はLegacy行から逆算しない。
INSERT INTO notifications (
  notification_id,
  created_by_user_id,
  push_title,
  push_body,
  notification_type,
  title,
  body,
  importance,
  source_type,
  source_id,
  source_hash,
  created_at,
  updated_at
)
SELECT
  notification_id,
  NULL,
  title,
  body,
  notification_type,
  title,
  body,
  'normal',
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at
FROM __migration_0033_notifications;

CREATE UNIQUE INDEX uq_notifications_source
  ON notifications(source_type, source_id, notification_type, source_hash);

CREATE TABLE firebase_tokens (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
  fcm_token TEXT NOT NULL,
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
  CASE
    -- 旧RepositoryのToken付け替えで生じた重複は、現在所有者を元の値で保持する。
    -- 履歴行とSchedule FKは削除せず、重複する旧行だけ追跡可能な値へ退避する。
    WHEN EXISTS (
      SELECT 1
      FROM __migration_0033_firebase_tokens candidate
      WHERE candidate.fcm_token = legacy.fcm_token
        AND (
          candidate.is_firebase_active > legacy.is_firebase_active
          OR (
            candidate.is_firebase_active = legacy.is_firebase_active
            AND candidate.firebase_token_id < legacy.firebase_token_id
          )
        )
    ) THEN legacy.fcm_token || '#legacy:' || legacy.firebase_token_id
    ELSE legacy.fcm_token
  END,
  is_firebase_active,
  last_seen_at,
  created_at,
  updated_at
FROM __migration_0033_firebase_tokens legacy;

CREATE INDEX idx_firebase_tokens_user_id
  ON firebase_tokens(user_id);
CREATE INDEX idx_firebase_tokens_active
  ON firebase_tokens(is_firebase_active);
CREATE UNIQUE INDEX uq_firebase_tokens_fcm_token
  ON firebase_tokens(fcm_token);

CREATE TABLE notification_schedules (
  notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  scheduled_by_user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(event_id) ON DELETE SET NULL,
  notification_id INTEGER NOT NULL
    REFERENCES notifications(notification_id) ON DELETE CASCADE,
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
FROM __migration_0033_notification_schedules;

CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
CREATE INDEX idx_notification_schedules_firebase_token_id
  ON notification_schedules(firebase_token_id);

DROP TABLE __migration_0033_notification_schedules;
DROP TABLE __migration_0033_firebase_tokens;
DROP TABLE __migration_0033_notifications;

-- 後続Resolver/Worker用の検索index。既存indexとは列の組み合わせが異なる。
CREATE INDEX idx_users_live_active_user_id
  ON users(is_live_active, user_id);
CREATE INDEX idx_students_class_room_id_user_id
  ON students(class_room_id, user_id);

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_notification_push_deliveries_recipient_token
  ON notification_push_deliveries(notification_recipient_id, firebase_token_id)
  WHERE firebase_token_id IS NOT NULL;
CREATE INDEX idx_notification_push_deliveries_firebase_token_id
  ON notification_push_deliveries(firebase_token_id);
CREATE INDEX idx_notification_push_deliveries_retry
  ON notification_push_deliveries(status, next_retry_at);

-- 再作成したtableだけAUTOINCREMENTの高水位を復元する。
UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT notifications_seq FROM __migration_0033_sequences))
WHERE name = 'notifications';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'notifications', notifications_seq
FROM __migration_0033_sequences
WHERE notifications_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notifications'
  );

UPDATE sqlite_sequence
SET seq = MAX(seq, (SELECT firebase_tokens_seq FROM __migration_0033_sequences))
WHERE name = 'firebase_tokens';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'firebase_tokens', firebase_tokens_seq
FROM __migration_0033_sequences
WHERE firebase_tokens_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'firebase_tokens'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_schedules_seq FROM __migration_0033_sequences)
)
WHERE name = 'notification_schedules';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_schedules', notification_schedules_seq
FROM __migration_0033_sequences
WHERE notification_schedules_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_schedules'
  );

DROP TABLE __migration_0033_sequences;
