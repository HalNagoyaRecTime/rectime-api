CREATE TABLE IF NOT EXISTS m_students (
  f_student_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  f_student_num TEXT    NOT NULL UNIQUE,
  f_class       TEXT    NOT NULL,
  f_number      TEXT    NOT NULL,
  f_name        TEXT    NOT NULL,
  f_note        TEXT
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

CREATE TABLE IF NOT EXISTS m_classes (
  f_class_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  f_class_name TEXT    NOT NULL UNIQUE
);
