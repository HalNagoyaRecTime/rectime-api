-- 0003_update_student_schema.sql で削除された参加情報テーブルを、
-- 新しい学生スキーマに合わせて再作成する。
CREATE TABLE IF NOT EXISTS t_entries (
  f_entry_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  f_student_id INTEGER NOT NULL REFERENCES m_student_description(f_student_id),
  f_event_id   INTEGER NOT NULL REFERENCES t_events(f_event_id),
  UNIQUE (f_student_id, f_event_id)
);

CREATE INDEX IF NOT EXISTS idx_t_entries_student_id
  ON t_entries(f_student_id);

CREATE INDEX IF NOT EXISTS idx_t_entries_event_id
  ON t_entries(f_event_id);

-- MVP検証用の参加データを新しい学生IDへ再登録する。
INSERT OR IGNORE INTO t_entries (f_student_id, f_event_id) VALUES
  (1, 1),
  (2, 1),
  (3, 2),
  (4, 2),
  (1, 3);
