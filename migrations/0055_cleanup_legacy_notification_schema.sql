-- 通知v2移行の最終整理。旧通知だけが参照していた列とindexを削除する。
-- 旧Scheduleの履歴はv2へ変換せず、Token参照を持つ旧行だけを物理削除する。

-- 旧Scheduleはfirebase_token_idだけが旧経路の識別子になっている。
-- v2で作成したScheduleはfirebase_token_idがNULLのため残す。
DELETE FROM notification_schedules
WHERE firebase_token_id IS NOT NULL;

-- 無効化済みTokenは旧active flagだけが参照していた。
-- 削除前にDelivery側の参照を外す。
UPDATE notification_push_deliveries
SET firebase_token_id = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE firebase_token_id IN (
  SELECT firebase_token_id
  FROM firebase_tokens
  WHERE is_firebase_active = 0
);

DELETE FROM firebase_tokens
WHERE is_firebase_active = 0;

-- firebase_tokensから旧active flagとindexを削除する。
DROP INDEX IF EXISTS idx_firebase_tokens_active;
ALTER TABLE firebase_tokens DROP COLUMN is_firebase_active;

-- notification_schedulesから旧通知専用の列とindexを削除する。
DROP INDEX IF EXISTS idx_notification_schedules_event_id;
DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id;

ALTER TABLE notification_schedules DROP COLUMN created_user_id;
ALTER TABLE notification_schedules DROP COLUMN event_id;
ALTER TABLE notification_schedules DROP COLUMN firebase_token_id;
ALTER TABLE notification_schedules DROP COLUMN importance;
ALTER TABLE notification_schedules DROP COLUMN fcm_message_id;
