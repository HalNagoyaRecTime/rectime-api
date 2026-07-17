CREATE TABLE notification_schedules (
  notification_send_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  gathering_group_id INTEGER NOT NULL REFERENCES gathering_groups(gathering_group_id),
  notification_id INTEGER NOT NULL REFERENCES notifications(notification_id),
  importance INTEGER NOT NULL DEFAULT 2
    CHECK (importance BETWEEN 1 AND 4),
  send_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (send_status IN ('draft', 'sending', 'sent', 'failed')),
  fcm_message_id TEXT UNIQUE,
  failed_reason TEXT,
  send_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_schedules_due
  ON notification_schedules(send_status, send_at);
CREATE INDEX idx_notification_schedules_event_id
  ON notification_schedules(event_id);
CREATE INDEX idx_notification_schedules_gathering_group_id
  ON notification_schedules(gathering_group_id);

DROP TABLE notification_send_logs;
