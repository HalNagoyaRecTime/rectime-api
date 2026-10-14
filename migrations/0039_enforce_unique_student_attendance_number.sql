-- 同じクラス内で出席番号が重複することを防ぐ。
-- 未所属Studentは両カラムがNULLのため制約対象外とする。
CREATE UNIQUE INDEX ux_students_class_room_attendance
ON students (class_room_id, attendance_number)
WHERE class_room_id IS NOT NULL;
