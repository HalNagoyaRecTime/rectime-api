-- 同じクラス内で出席番号が重複することを防ぐ。
-- 未所属Studentは両カラムがNULLのため制約対象外とする。
-- 既存重複がある場合はデータを自動削除せず、CHECK制約で安全に中断する。
-- READMEの手順で重複内容を確認・整理してからMigrationを再実行すること。
DROP TABLE IF EXISTS __migration_0054_duplicate_guard;

CREATE TABLE __migration_0054_duplicate_guard (
    duplicate_group_count INTEGER NOT NULL
        CHECK (duplicate_group_count = 0)
);

INSERT INTO __migration_0054_duplicate_guard (duplicate_group_count)
SELECT COUNT(*)
FROM (
    SELECT class_room_id, attendance_number
    FROM students
    WHERE class_room_id IS NOT NULL
    GROUP BY class_room_id, attendance_number
    HAVING COUNT(*) > 1
);

DROP TABLE __migration_0054_duplicate_guard;

CREATE UNIQUE INDEX ux_students_class_room_attendance
ON students (class_room_id, attendance_number)
WHERE class_room_id IS NOT NULL;
