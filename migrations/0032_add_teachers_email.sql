-- Microsoftの表示名(displayName)はテナント側の命名規則に依存し、
-- 学籍番号・職員番号の前置など氏名以外の要素が混ざり得るため、事前登録した
-- 教員とMicrosoftアカウントを突き合わせるキーには使えない。サインインに使う
-- アドレスを事前登録時に必須で受け取り、これを突合キーとする。

-- 既存の教員にemailを後から埋める手段が無いため、1件でも残っている環境では
-- NOT NULL化できない。検知した時点で中断する。
CREATE TABLE __migration_0032_guard (teacher_count INTEGER CHECK (teacher_count = 0));
INSERT INTO __migration_0032_guard (teacher_count) SELECT COUNT(*) FROM teachers;
DROP TABLE __migration_0032_guard;

-- AUTOINCREMENTが一度払い出したIDを再利用しないよう高水位を退避する。
-- teacher_idの再利用は、class_rooms.teacher_idの過去の値を別の教員として
-- 解釈させてしまう。
CREATE TABLE __migration_0032_sequences (teachers_seq INTEGER NOT NULL);
INSERT INTO __migration_0032_sequences (teachers_seq)
SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'teachers'), 0);

-- 上のガードによりteachersは空であることが保証されているため、行を退避せずに
-- 作り直す。class_rooms.teacher_idのFKはテーブル名で解決されるため、
-- 同名で作り直せば参照は元のまま維持される。
DROP TABLE teachers;

CREATE TABLE teachers (
  teacher_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

INSERT INTO sqlite_sequence (name, seq)
SELECT 'teachers', teachers_seq
FROM __migration_0032_sequences
WHERE teachers_seq > 0
  AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'teachers');

DROP TABLE __migration_0032_sequences;

CREATE UNIQUE INDEX uq_teachers_email ON teachers(email);
