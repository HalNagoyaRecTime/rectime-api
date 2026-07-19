CREATE TABLE student_master (
  student_master INTEGER PRIMARY KEY AUTOINCREMENT,
  class_code INTEGER NOT NULL,
  attendance_number INTEGER NOT NULL,
  student_id_number INTEGER NOT NULL UNIQUE,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (class_code, attendance_number)
);
