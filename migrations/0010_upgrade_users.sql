-- 本マイグレーションは再実行不可(auth_usersへのリネーム・破壊的なDROP TABLEを含む)。
-- 誤って再実行された場合に静かに失敗させず、原因を特定しやすくするため
-- auth_users の事前存在チェックで即座に中断する。
CREATE TABLE __migration_0010_guard (already_applied INTEGER CHECK (already_applied = 0));
INSERT INTO __migration_0010_guard (already_applied)
SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'auth_users';
DROP TABLE IF EXISTS __migration_0010_guard;

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

-- 移行元データで学級未割当(f_class_room_id が NULL)の生徒がいても
-- students.class_room_id の NOT NULL 制約に違反しないよう、受け皿の教室を用意する
INSERT INTO class_rooms (class_code, class_name)
SELECT '__UNASSIGNED__', '未割当'
WHERE EXISTS (
    SELECT 1
    FROM m_student_description sd
    INNER JOIN m_users m ON sd.f_users_id = m.f_users_id
    WHERE m.f_class_room_id IS NULL
);

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

-- INNER JOIN は m_users に対応レコードがない m_student_description を
-- 移行対象から静かに除外してしまうため、孤立レコードがあれば移行を中断する
CREATE TABLE __migration_guard (orphan_count INTEGER CHECK (orphan_count = 0));
INSERT INTO __migration_guard (orphan_count)
SELECT COUNT(*)
FROM m_student_description sd
LEFT JOIN m_users m ON sd.f_users_id = m.f_users_id
WHERE m.f_users_id IS NULL;
DROP TABLE IF EXISTS __migration_guard;

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
    COALESCE(
        m.f_class_room_id,
        (SELECT class_room_id FROM class_rooms WHERE class_code = '__UNASSIGNED__')
    ),
    sd.f_attendance_number,
    sd.f_student_id_number,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM m_student_description sd
INNER JOIN m_users m ON sd.f_users_id = m.f_users_id;


DROP TABLE IF EXISTS m_student_description;
DROP TABLE IF EXISTS m_users;
DROP TABLE IF EXISTS m_class_rooms;
