ALTER TABLE notifications ADD COLUMN user_id INTEGER REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN link_url TEXT;
ALTER TABLE notifications ADD COLUMN resource_type TEXT;
ALTER TABLE notifications ADD COLUMN resource_id TEXT;
ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN send_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE notifications ADD COLUMN sent_at TEXT;
ALTER TABLE notifications ADD COLUMN read_at TEXT;
ALTER TABLE notifications ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON notifications(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_at
  ON notifications(user_id, read_at);

