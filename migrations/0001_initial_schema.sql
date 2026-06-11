CREATE TABLE IF NOT EXISTS m_users (
  f_users_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  f_class_room_id     INTEGER,
  f_display_name      TEXT    NOT NULL,
  f_uid               TEXT    NOT NULL,
  FOREIGN KEY (f_class_room_id) REFERENCES m_class_rooms(f_class_room_id)
);

CREATE TABLE IF NOT EXISTS m_class_rooms (
  f_class_room_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  f_class_code        TEXT NOT NULL,
  f_name              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS m_student_description (
  f_student_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  f_users_id          INTEGER NOT NULL,
  f_attendance_number   TEXT NOT NULL,
  f_student_id_number   TEXT NOT NULL,
  FOREIGN KEY (f_users_id) REFERENES m_users(f_users_id)
);

CREATE TABLE IF NOT EXISTS t_events (
  f_event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  f_event_code  TEXT    NOT NULL UNIQUE,
  f_event_name  TEXT    NOT NULL,
  f_time        TEXT    NOT NULL,
  f_duration    TEXT    NOT NULL,
  f_place       TEXT    NOT NULL,
  f_gather_time TEXT    NOT NULL,
  f_summary     TEXT
);

CREATE TABLE IF NOT EXISTS t_entries (
  f_entry_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  f_student_id INTEGER NOT NULL REFERENCES m_students(f_student_id),
  f_event_id   INTEGER NOT NULL REFERENCES t_events(f_event_id),
  UNIQUE (f_student_id, f_event_id)
);
