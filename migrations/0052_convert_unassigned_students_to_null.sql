-- 旧Migrationでダミー教室へ割り当てた未所属Studentを、NULLの所属情報へ移行する。
-- 未解決の予約通知が旧未割当クラスを参照している場合は、宛先0人で正常完了しないよう停止する。
UPDATE notification_schedules
SET
    send_status = 'stopped',
    stopped_at = COALESCE(stopped_at, CURRENT_TIMESTAMP),
    reason = 'source_deleted',
    updated_at = CURRENT_TIMESTAMP
WHERE recipients_resolved_at IS NULL
  AND send_status IN ('scheduled', 'resolving')
  AND EXISTS (
      SELECT 1
      FROM notification_audiences
      INNER JOIN class_rooms
          ON class_rooms.class_room_id = notification_audiences.target_id
      WHERE notification_audiences.notification_schedule_id = notification_schedules.notification_schedule_id
        AND notification_audiences.audience_type = 'class_room'
        AND class_rooms.class_code = '__UNASSIGNED__'
  );

UPDATE students
SET
    class_room_id = NULL,
    attendance_number = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE class_room_id = (
    SELECT class_room_id
    FROM class_rooms
    WHERE class_code = '__UNASSIGNED__'
);

DELETE FROM class_rooms
WHERE class_code = '__UNASSIGNED__';
