-- 競技開始日を追加し、開始10分前通知が同じ時刻の別日競技へ誤送信されないようにする。
ALTER TABLE t_events ADD COLUMN f_event_date TEXT;

-- 既存のモック競技は、移行実行日のJST日付に寄せてすぐ通知テストできる状態にする。
UPDATE t_events
SET f_event_date = date('now', '+9 hours')
WHERE f_event_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_t_events_event_date_time
ON t_events (f_event_date, f_time);
