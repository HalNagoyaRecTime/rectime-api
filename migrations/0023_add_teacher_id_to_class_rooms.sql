-- 1クラスの担当教員は最大1人という運用前提のため、多対多の中間テーブルではなく
-- class_rooms に teacher_id を直接持たせる。逆方向（1人の教員が複数クラスを
-- 担当すること）は許容するため、teacher_id にUNIQUE制約は付けない。
-- クラス作成時点では担当教員が未定のこともあるためNULLを許容する。
ALTER TABLE class_rooms ADD COLUMN teacher_id INTEGER REFERENCES teachers(teacher_id);

CREATE INDEX idx_class_rooms_teacher_id
  ON class_rooms(teacher_id);
