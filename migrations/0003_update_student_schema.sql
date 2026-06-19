-- m_students, t_entries を削除し、m_class_rooms, m_users, m_student_description に再編する

-- 既存テーブルの削除
DROP TABLE IF EXISTS t_entries;
DROP TABLE IF EXISTS m_students;

-- 新しいテーブルの作成
CREATE TABLE IF NOT EXISTS m_class_rooms (
  f_class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
  f_class_code    TEXT    NOT NULL,
  f_name          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS m_users (
  f_users_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  f_class_room_id INTEGER,
  f_display_name  TEXT    NOT NULL,
  f_uid           TEXT    NOT NULL,
  FOREIGN KEY (f_class_room_id) REFERENCES m_class_rooms(f_class_room_id)
);

CREATE TABLE IF NOT EXISTS m_student_description (
  f_student_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  f_users_id          INTEGER NOT NULL,
  f_attendance_number INTEGER NOT NULL,
  f_student_id_number TEXT    NOT NULL UNIQUE,
  FOREIGN KEY (f_users_id) REFERENCES m_users(f_users_id)
);

-- シードデータ
INSERT INTO m_class_rooms (f_class_code, f_name) VALUES
  ('11A', '1年Aクラス'),
  ('11B', '1年Bクラス'),
  ('12A', '2年Aクラス');

INSERT INTO m_users (f_class_room_id, f_display_name, f_uid) VALUES
  (1, '田中太郎', '0000-0000'),
  (1, '佐藤花子', '0000-0001'),
  (2, '鈴木一郎', '0000-0002'),
  (2, '高橋美咲', '0000-0003'),
  (3, '山田健太', '0000-0004');

INSERT INTO m_student_description (f_users_id, f_attendance_number, f_student_id_number) VALUES
  (1, 1, '24A001'),
  (2, 2, '24A002'),
  (3, 3, '24B001'),
  (4, 4, '24B002'); -- 5番目は先生のため m_student_description には含めない
