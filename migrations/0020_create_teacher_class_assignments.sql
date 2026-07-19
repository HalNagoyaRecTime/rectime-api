-- 教員と担当クラスの多対多を表す中間テーブルを追加する。
-- 1人の教員が複数クラスを担当でき、1クラスに複数教員が紐づくことも許容する。
CREATE TABLE teacher_class_assignments (
  teacher_class_assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id    INTEGER NOT NULL REFERENCES teachers(teacher_id),
  class_room_id INTEGER NOT NULL REFERENCES class_rooms(class_room_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (teacher_id, class_room_id)
);

CREATE INDEX idx_teacher_class_assignments_class_room_id
  ON teacher_class_assignments(class_room_id);
