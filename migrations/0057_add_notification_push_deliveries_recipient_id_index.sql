-- uq_notification_push_deliveries_recipient_token は firebase_token_id IS NOT NULL の部分indexで、
-- 条件を持たない配信状況の集計では使えず、受信者ごとに配信テーブルを全件読んでいた。
-- status は含めない。含めると配信の状態が変わるたびにindexも書き換わり、D1の書き込み行数が増えるため。
CREATE INDEX idx_notification_push_deliveries_recipient_id
  ON notification_push_deliveries(notification_recipient_id);
