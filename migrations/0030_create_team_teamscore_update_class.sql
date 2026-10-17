-- このマイグレーションはclass_roomsを作り直す(下記)。作り直しでは、列を明示して
-- コピーするため、他のマイグレーションが先に足した列(例: lock_version)は消えてしまう。
-- SQLでは列の有無で処理を分けられないため、想定の6列以外が存在する場合は、列を黙って
-- 失わずにここで中断する(同じバッチ内なので何も書き込まれない)。
-- 中断した場合は、このマイグレーションをその列の追加より先に適用するか、
-- 作り直しの列にその列を加えてから適用する。
CREATE TABLE __migration_0030_guard (
  ok INTEGER NOT NULL CONSTRAINT class_rooms_has_columns_0030_would_drop CHECK (ok = 1)
);
INSERT INTO __migration_0030_guard (ok)
SELECT CASE WHEN COUNT(*) = 6 THEN 1 ELSE 0 END
FROM pragma_table_info('class_rooms');
DROP TABLE __migration_0030_guard;

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
-- 後からNOT NULLに変更できないため、class_roomsを作り直す。
--
-- 作り直すのはclass_roomsだけで、students・他のテーブルには触れない。
-- students.class_room_id のFKは「テーブル名」で解決されるため、class_roomsを
-- 同名で作り直せば参照は元のまま維持される(0032のteachersと同じ性質)。
-- studentsを作り直すと、他の移行が足した索引・制約(0033の索引、studentsを
-- NULL許容にする移行など)を、適用順によって巻き戻してしまうため避ける。
--
-- 子(students)が参照中のclass_roomsをDROPするとFK違反になるため、コミット時まで
-- 検査を遅らせる。作り直した後は同名のテーブルが存在するので、検査は成功する。
PRAGMA defer_foreign_keys = TRUE;

-- AUTOINCREMENTが一度払い出したIDを再利用しないよう、高水位を退避する。
CREATE TABLE __migration_0030_sequences (class_rooms_seq INTEGER NOT NULL);
INSERT INTO __migration_0030_sequences (class_rooms_seq)
SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'class_rooms'), 0);

-- 行を退避してから親(class_rooms)をDROPし、同名で作り直した表へ戻す。
-- 別名の表(class_rooms_new)へ先にコピーしてRENAMEする方式だと、DROPで増えた
-- 遅延FK違反の数が、同名の親表へのINSERTでしか減らないためコミット時に残り、
-- studentsに行がある環境でFK違反になる。
CREATE TABLE __migration_0030_class_rooms AS
SELECT class_room_id, class_code, class_name, teacher_id, created_at, updated_at
FROM class_rooms;

DROP TABLE class_rooms;

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
FROM __migration_0030_class_rooms;

DROP TABLE __migration_0030_class_rooms;

-- 作り直しで採番の高水位が下がっていれば、退避した値へ戻す。
UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT class_rooms_seq FROM __migration_0030_sequences)
)
WHERE name = 'class_rooms';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'class_rooms', class_rooms_seq
FROM __migration_0030_sequences
WHERE class_rooms_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'class_rooms');

DROP TABLE __migration_0030_sequences;

CREATE UNIQUE INDEX uq_class_rooms_class_code ON class_rooms(class_code);
CREATE INDEX idx_class_rooms_teacher_id ON class_rooms(teacher_id);
CREATE INDEX idx_class_rooms_team_id ON class_rooms(team_id);
