CREATE TABLE IF NOT EXISTS m_schedules (
  f_schedule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  f_schedule_type TEXT    NOT NULL, -- 'competition' | 'ceremony' | 'break' | 'other'
  f_name          TEXT    NOT NULL,
  f_description   TEXT,
  f_start_time    TEXT    NOT NULL, -- "HH:MM" 形式
  f_end_time      TEXT    NOT NULL, -- "HH:MM" 形式
  f_location      TEXT,
  f_order         INTEGER NOT NULL
);
