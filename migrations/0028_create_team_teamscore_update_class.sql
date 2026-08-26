CREATE TABLE teams (
  team_id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_scores (
  team_score_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  team_id INTEGER NOT NULL REFERENCES teams(team_id),
  scores INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_team_scores_event_id ON team_scores(event_id);
CREATE INDEX idx_team_scores_team_id ON team_scores(team_id);

-- 既存のclass_roomsを、そのクラス名をそのままチーム名としてteamsへ引き継ぐ
INSERT INTO teams (team_name)
SELECT class_name FROM class_rooms;

-- class_rooms.team_id はNOT NULLにするが、SQLite(D1)は既存行があるカラムを
-- 後からNOT NULLに変更できない。また、students.class_room_id が class_rooms を
-- 外部キー参照しているため、class_roomsを単純にDROPすると暗黙のDELETEで
-- FK違反になる。そのため、students側も含めて旧テーブルを退避名へ移し、
-- 最終テーブル名で作り直してから旧テーブルを子→親の順で削除する。
ALTER TABLE class_rooms RENAME TO class_rooms_legacy;
ALTER TABLE students RENAME TO students_legacy;

CREATE TABLE class_rooms (
  class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_code TEXT NOT NULL,
  class_name TEXT NOT NULL,
  -- 1クラスの担当教員は最大1人という運用前提のカラム。クラス作成時点では
  -- 未定のこともあるためNULLを許容する。逆方向（1人の教員が複数クラスを
  -- 担当すること）は許容するため、UNIQUE制約は付けない。
  teacher_id INTEGER REFERENCES teachers(teacher_id),
  team_id INTEGER NOT NULL REFERENCES teams(team_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 直前のINSERTでteamsはclass_rooms_legacyと同じ並び順(class_room_id昇順)で
-- 1行ずつ採番されているため、ROW_NUMBER()で突き合わせて対応するteam_idを引き継ぐ
INSERT INTO class_rooms (
  class_room_id, class_code, class_name, teacher_id, team_id, created_at, updated_at
)
SELECT
  c.class_room_id,
  c.class_code,
  c.class_name,
  c.teacher_id,
  t.team_id,
  c.created_at,
  c.updated_at
FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY class_room_id) AS rn
  FROM class_rooms_legacy
) c
JOIN (
  SELECT team_id, ROW_NUMBER() OVER (ORDER BY team_id) AS rn
  FROM teams
) t ON t.rn = c.rn;

-- students自体のスキーマ・データは変更せず、参照先だけを新しいclass_roomsに
-- 向け直すために作り直す。
CREATE TABLE students (
  student_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  class_room_id INTEGER NOT NULL,
  attendance_number INTEGER NOT NULL,
  student_id_number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id),
  UNIQUE (user_id)
);

INSERT INTO students (
  student_id, user_id, class_room_id, attendance_number,
  student_id_number, created_at, updated_at
)
SELECT
  student_id, user_id, class_room_id, attendance_number,
  student_id_number, created_at, updated_at
FROM students_legacy;

-- 外部キーの子から順に旧テーブルを削除する。
DROP TABLE students_legacy;
DROP TABLE class_rooms_legacy;

CREATE UNIQUE INDEX uq_class_rooms_class_code ON class_rooms(class_code);
CREATE INDEX idx_class_rooms_teacher_id ON class_rooms(teacher_id);
CREATE INDEX idx_class_rooms_team_id ON class_rooms(team_id);
