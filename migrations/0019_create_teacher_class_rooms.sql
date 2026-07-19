CREATE TABLE teacher_class_rooms (
  teacher_class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  class_room_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id),
  FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id),
  UNIQUE (teacher_id, class_room_id)
);

CREATE INDEX idx_teacher_class_rooms_teacher_id
  ON teacher_class_rooms(teacher_id);
CREATE INDEX idx_teacher_class_rooms_class_room_id
  ON teacher_class_rooms(class_room_id);
