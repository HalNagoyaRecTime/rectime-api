-- notification_schedules を「集会グループ単位」から「Firebaseトークン単位」の
-- スケジュールへ再構成する。送信時にグループの全メンバーへ一括送信するのではなく、
-- 1行=1デバイスへの送信として、送信結果(fcm_message_id/failed_reason)を
-- デバイスごとに正確に記録できるようにする。

-- 既存行を新スキーマへ機械的に引き継ぐ安全な方法がない
-- （1グループに複数のFirebaseトークンが存在し得るため、既存の1行を
-- どのトークン宛の行として引き継ぐべきか一意に定まらない）。
-- 既存行がある場合は原因を特定しやすいよう即座に中断する。
CREATE TABLE __migration_0025_guard (row_count INTEGER CHECK (row_count = 0));
INSERT INTO __migration_0025_guard (row_count)
SELECT COUNT(*) FROM notification_schedules;
DROP TABLE __migration_0025_guard;

DROP INDEX IF EXISTS idx_notification_schedules_due;
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_gathering_group_id;

ALTER TABLE notification_schedules RENAME TO notification_schedules_legacy;

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

DROP TABLE notification_schedules_legacy;

CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_notification_id
  ON notification_schedules(notification_id);
CREATE INDEX idx_notification_schedules_firebase_token_id
  ON notification_schedules(firebase_token_id);
