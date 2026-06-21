CREATE TABLE IF NOT EXISTS notification_send_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL REFERENCES t_events(f_event_id),
  firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(id),
  notification_type TEXT NOT NULL,
  scheduled_for_date TEXT NOT NULL,
  fcm_message_id TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (
    event_id,
    firebase_token_id,
    notification_type,
    scheduled_for_date
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_send_logs_event_id
  ON notification_send_logs(event_id);

CREATE INDEX IF NOT EXISTS idx_notification_send_logs_scheduled_for_date
  ON notification_send_logs(scheduled_for_date);
