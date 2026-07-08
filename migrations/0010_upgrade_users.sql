PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;


ALTER TABLE users RENAME TO auth_users;

CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    is_live_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (user_id, user_name, is_live_active)
SELECT
    f_users_id,
    f_display_name,
    1
FROM m_users;

CREATE TABLE class_rooms (
    class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_code TEXT NOT NULL,
    class_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO class_rooms (
    class_room_id,
    class_code,
    class_name,
    created_at,
    updated_at
)
SELECT
    f_class_room_id,
    f_class_code,
    f_name,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM m_class_rooms;

CREATE TABLE students (
    student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    class_room_id INTEGER NOT NULL,
    attendance_number INTEGER NOT NULL,
    student_id_number TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id),
    UNIQUE (user_id)
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
    sd.f_student_id,
    m.f_users_id,
    m.f_class_room_id,
    sd.f_attendance_number,
    sd.f_student_id_number,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM m_student_description sd
INNER JOIN m_users m ON sd.f_users_id = m.f_users_id;


DROP TABLE IF EXISTS m_student_description;
DROP TABLE IF EXISTS m_users;
DROP TABLE IF EXISTS m_class_rooms;

COMMIT;
PRAGMA foreign_keys = ON;
