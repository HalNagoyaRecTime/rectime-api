-- 予約の未送信の配信を、受信者IDの範囲でstatusのindexから引けるようにする。
-- statusを含むindexを足すと配信の状態が変わるたびに書き込み行数が増えるため、(status, next_retry_at) を置き換える。
DROP INDEX IF EXISTS idx_notification_push_deliveries_retry;
CREATE INDEX idx_notification_push_deliveries_status_recipient_id
  ON notification_push_deliveries(status, notification_recipient_id);
CREATE INDEX idx_notification_recipients_schedule_id
  ON notification_recipients(notification_schedule_id);
