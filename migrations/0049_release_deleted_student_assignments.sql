-- すでに退会済みのStudentが保持しているクラス・出席番号を解放する。
-- students行は履歴として残し、所属情報だけを未所属の状態へ変更する。
UPDATE students
SET
    class_room_id = NULL,
    attendance_number = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE user_id IN (
    SELECT user_id
    FROM users
    WHERE deletion_status = 'deleted'
)
AND class_room_id IS NOT NULL;
