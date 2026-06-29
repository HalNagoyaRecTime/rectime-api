-- 予定（スケジュール）マスタ。手順4で D1 から取得する実装に差し替える際に使用する。
CREATE TABLE IF NOT EXISTS m_schedules (
  f_schedule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  f_schedule_type TEXT    NOT NULL
    CHECK (f_schedule_type IN ('ceremony', 'competition', 'break', 'other')),
  f_name          TEXT    NOT NULL,
  f_description   TEXT,
  f_start_time    TEXT    NOT NULL, -- "HH:MM" 形式
  f_end_time      TEXT    NOT NULL, -- "HH:MM" 形式
  f_location      TEXT,
  f_order         INTEGER NOT NULL
);
