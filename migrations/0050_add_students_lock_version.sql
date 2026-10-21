-- studentsの更新の楽観ロックに使う版番号。更新のたびに1ずつ増やす。
-- updated_atはCURRENT_TIMESTAMP（秒単位）で書かれる経路があり、同じ秒内の更新を
-- 区別できないため、版の比較にはこの列を使う。
-- 既存の行は0から始まる。NOT NULLの列はDEFAULT付きでないと追加できない。
ALTER TABLE students ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 0;
