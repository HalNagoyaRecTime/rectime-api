-- Studentがクラス未所属になれるよう、所属情報をNULL許容にする。
-- class_room_idとattendance_numberは、両方NULLまたは両方値ありだけを許可する。
DROP INDEX IF EXISTS idx_students_class_room_id_user_id;

ALTER TABLE students RENAME TO __migration_0035_students;

CREATE TABLE students (
    student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    class_room_id INTEGER,
    attendance_number INTEGER,
    student_id_number TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id),
    UNIQUE (user_id),
    CHECK (
        (class_room_id IS NULL AND attendance_number IS NULL)
        OR
        (class_room_id IS NOT NULL AND attendance_number IS NOT NULL)
    )
);

INSERT INTO students (
    student_id,
    user_id,
    class_room_id,
    attendance_number,
    student_id_number,
    created_at,
    updated_at
)
SELECT
    student_id,
    user_id,
    class_room_id,
    attendance_number,
    student_id_number,
    created_at,
    updated_at
FROM __migration_0035_students;

DROP TABLE __migration_0035_students;

CREATE INDEX idx_students_class_room_id_user_id
    ON students(class_room_id, user_id);
