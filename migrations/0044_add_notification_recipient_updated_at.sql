-- Recipient匿名化の更新時刻を保持する。既存行は作成時刻を初期値にする。
ALTER TABLE notification_recipients ADD COLUMN updated_at TEXT;

UPDATE notification_recipients
SET updated_at = created_at
WHERE updated_at IS NULL;
