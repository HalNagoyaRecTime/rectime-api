-- 旧Migrationでダミー教室へ割り当てた未所属Studentを、NULLの所属情報へ移行する。
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
