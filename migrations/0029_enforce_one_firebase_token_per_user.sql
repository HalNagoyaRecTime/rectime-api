-- 「1利用者1端末」を採用し、DBをそのモデルへ合わせる。
-- 併せて fcm_token のUNIQUEを「有効な行だけ」に緩める。
-- 端末を別の利用者へ付け替える際、旧所有者の行は notification_schedules から
-- FK参照されているため削除できず、無効化して残すしかない。全体UNIQUEのままだと
-- 無効化済みの行が Token を占有し、新しい所有者が登録できなくなる。

-- 1利用者に複数行が存在すると user_id のUNIQUE化でどの行を残すか一意に決まらない。
-- 検知した時点で中断する。
CREATE TABLE __migration_0029_guard (duplicated_user_count INTEGER CHECK (duplicated_user_count = 0));
INSERT INTO __migration_0029_guard (duplicated_user_count)
SELECT COUNT(*)
FROM (
  SELECT user_id
  FROM firebase_tokens
  GROUP BY user_id
  HAVING COUNT(*) > 1
);
DROP TABLE __migration_0029_guard;

-- 既存データが削除済みでも、AUTOINCREMENTが一度払い出したIDを再利用しないよう
-- 旧テーブルの高水位を退避する。firebase_token_id の再利用は、過去の
-- notification_schedules を別の端末の送信履歴として解釈させてしまう。
CREATE TABLE __migration_0029_sequences (
  firebase_tokens_seq INTEGER NOT NULL,
  notification_schedules_seq INTEGER NOT NULL
);

INSERT INTO __migration_0029_sequences (
  firebase_tokens_seq,
  notification_schedules_seq
)
SELECT
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'firebase_tokens'),
    0
  ),
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'notification_schedules'),
    0
  );

DROP INDEX IF EXISTS idx_firebase_tokens_user_id;
DROP INDEX IF EXISTS idx_firebase_tokens_active;
DROP INDEX IF EXISTS idx_notification_schedules_due;
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_notification_id;
DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id;

-- 旧テーブルを一時名へ変更し、最終名のテーブルを直接作成する。
-- 子テーブルの外部キーをテーブル名のrenameへ依存させないことで、
-- legacy_alter_tableの設定にかかわらずfirebase_tokensを参照できるようにする。
ALTER TABLE notification_schedules RENAME TO notification_schedules_legacy;
ALTER TABLE firebase_tokens RENAME TO firebase_tokens_legacy;

CREATE TABLE firebase_tokens (
  firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
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
  fcm_token,
  is_firebase_active,
  last_seen_at,
  created_at,
  updated_at
FROM firebase_tokens_legacy;

CREATE TABLE notification_schedules (
  notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_user_id INTEGER REFERENCES users(user_id),
  event_id INTEGER REFERENCES events(event_id),
  notification_id INTEGER NOT NULL REFERENCES notifications(notification_id),
  firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(firebase_token_id),
  importance INTEGER NOT NULL DEFAULT 2
    CHECK (importance BETWEEN 1 AND 4),
  send_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (send_status IN ('draft', 'sending', 'sent', 'failed')),
  fcm_message_id TEXT,
  failed_reason TEXT,
  send_at TEXT NOT NULL,
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
FROM notification_schedules_legacy;

DROP TABLE notification_schedules_legacy;
DROP TABLE firebase_tokens_legacy;

-- 現存する最大IDと旧AUTOINCREMENT高水位の大きい方を維持する。
UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT firebase_tokens_seq FROM __migration_0029_sequences)
)
WHERE name = 'firebase_tokens';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'firebase_tokens', firebase_tokens_seq
FROM __migration_0029_sequences
WHERE firebase_tokens_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'firebase_tokens'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT notification_schedules_seq FROM __migration_0029_sequences)
)
WHERE name = 'notification_schedules';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'notification_schedules', notification_schedules_seq
FROM __migration_0029_sequences
WHERE notification_schedules_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'notification_schedules'
  );

DROP TABLE __migration_0029_sequences;

CREATE UNIQUE INDEX idx_firebase_tokens_active_fcm_token
  ON firebase_tokens(fcm_token)
  WHERE is_firebase_active = 1;
CREATE INDEX idx_firebase_tokens_active
  ON firebase_tokens(is_firebase_active);
CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
CREATE INDEX idx_notification_schedules_firebase_token_id
  ON notification_schedules(firebase_token_id);
