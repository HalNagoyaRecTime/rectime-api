-- 受信者IDは予約ごとに連続しないため、配信に予約IDを持たせ、予約の未送信の配信を予約IDで引けるようにする。
-- 外部キーは付けない。予約を消すと受信者経由で配信も消えるため。
ALTER TABLE notification_push_deliveries ADD COLUMN notification_schedule_id INTEGER;

UPDATE notification_push_deliveries
SET notification_schedule_id = (
  SELECT r.notification_schedule_id
  FROM notification_recipients r
  WHERE r.notification_recipient_id = notification_push_deliveries.notification_recipient_id
);

-- statusを含むindexを足すと配信の状態が変わるたびに書き込み行数が増えるため、(status, next_retry_at) を置き換える。
DROP INDEX IF EXISTS idx_notification_push_deliveries_retry;
CREATE INDEX idx_notification_push_deliveries_status_schedule_id
  ON notification_push_deliveries(status, notification_schedule_id);
