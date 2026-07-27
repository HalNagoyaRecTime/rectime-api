-- クラスに担任教員を紐付けられるようにする。既存のclass_roomsには
-- 担任が未設定のものがあり得るためNULL許容とする。
ALTER TABLE class_rooms ADD COLUMN teacher_id INTEGER REFERENCES teachers(teacher_id);

CREATE INDEX idx_class_rooms_teacher_id ON class_rooms(teacher_id);
