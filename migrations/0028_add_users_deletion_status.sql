-- 本人によるアカウント削除(#265)は、管理上の一時無効化(is_live_active)とは
-- 別の状態として扱う。is_live_activeは教員の論理削除・学生の再登録復元
-- (#262)が引き続き参照するため変更せず、削除専用のカラムを新設する。
ALTER TABLE users ADD COLUMN deletion_status TEXT NOT NULL DEFAULT 'active'
    CHECK (deletion_status IN ('active', 'deletion_pending', 'deleted'));
ALTER TABLE users ADD COLUMN deletion_requested_at TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_users_deletion_status ON users(deletion_status);
