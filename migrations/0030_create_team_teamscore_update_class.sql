CREATE TABLE teams (
  team_id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 複数クラスをまとめた編成名として運用されるため、重複は運用事故に
  -- つながる。一意制約で防ぐ。
  team_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_teams_team_name ON teams(team_name);

-- 得点は編成ごとの合計のみを保持する。イベント別の内訳は要件に無いため持たない。
-- (内訳が必要になった場合は event_id を含む明細テーブルを別途追加し、
--  ここは集計結果のキャッシュとして扱う)
CREATE TABLE team_scores (
  team_score_id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL UNIQUE REFERENCES teams(team_id),
  scores INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 既存のclass_roomsを、そのクラス名をそのままチーム名としてteamsへ引き継ぐ。
-- 並び順を保証しない問い合わせ同士をROW_NUMBER()等で突き合わせるのは危険なため、
-- team_idにclass_room_idの値をそのまま明示的に採番する。
-- これによりteam_idとclass_room_idが常に一致し、対応付けに関する仮定が一切不要になる。
INSERT INTO teams (team_id, team_name)
SELECT class_room_id, class_name||'('||class_code||')' FROM class_rooms;

-- team_scoresの行は得点が入ったときに初めて作る(得点入力APIでUPSERT)。
-- ここで全teamsに0点の行を作ってしまうと、class_roomsの後片付け条件
-- (NOT EXISTS team_scores)が本番では常に不成立になり、単独編成が
-- 消せなくなる。

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

-- 直前のteams採番でteam_id = class_room_idとしているため、
-- 対応するteam_idはclass_room_idの値をそのまま使えばよい。
INSERT INTO class_rooms (
  class_room_id, class_code, class_name, teacher_id, team_id, created_at, updated_at
)
SELECT
  class_room_id, class_code, class_name, teacher_id, class_room_id, created_at, updated_at
FROM class_rooms_legacy;

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
