-- 職員・教員のロール拡張テーブルを追加する。students と同様、
-- 1ユーザーにつき最大1行（1:1）を想定し user_id に UNIQUE を付与する。
CREATE TABLE staffs (
  staff_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE teachers (
  teacher_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- microsoft_account_links を auth_users(users_id: TEXT のUUID文字列) 参照から
-- users(user_id: INTEGER 自動採番) 参照へ作り直す。
-- SQLite は列の型やFK参照先を直接変更できないため、テーブル再作成で移行する。
--
-- INSERT...SELECT で新規採番される user_id を後続の文でも参照できるよう、
-- users に一時列 __legacy_auth_users_id を追加して旧UUIDを控えておき、
-- 移行完了後に列ごと削除する（表示名などの間接的な突き合わせに頼らず、
-- 実際のUUID値で1対1に正確に対応付けるため）。
ALTER TABLE users ADD COLUMN __legacy_auth_users_id TEXT;

INSERT INTO users (user_name, is_live_active, __legacy_auth_users_id)
SELECT display_name, 1, users_id
FROM auth_users
WHERE users_id IN (SELECT user_id FROM microsoft_account_links);

CREATE TABLE microsoft_account_links_new (
  microsoft_account_link_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  oid        TEXT NOT NULL,
  tid        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

INSERT INTO microsoft_account_links_new (user_id, oid, tid, created_at, updated_at)
SELECT u.user_id, m.oid, m.tid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM microsoft_account_links m
INNER JOIN users u ON u.__legacy_auth_users_id = m.user_id;

DROP TABLE microsoft_account_links;
ALTER TABLE microsoft_account_links_new RENAME TO microsoft_account_links;

CREATE UNIQUE INDEX idx_microsoft_account_links_oid_tid
  ON microsoft_account_links(oid, tid);

CREATE INDEX idx_microsoft_account_links_user_id
  ON microsoft_account_links(user_id);

ALTER TABLE users DROP COLUMN __legacy_auth_users_id;

-- auth_users.display_name/uid/users_id は microsoft_account_links からの
-- 参照専用に追加されたカラム（migrations/0006）で、上記の付け替え後は
-- 参照元が無くなるため削除する。auth_users は firebase_tokens/通知登録の
-- 識別子（student_number 等）としては引き続き使用される。
DROP INDEX IF EXISTS idx_users_uid;
DROP INDEX IF EXISTS idx_users_users_id;
ALTER TABLE auth_users DROP COLUMN uid;
ALTER TABLE auth_users DROP COLUMN display_name;
ALTER TABLE auth_users DROP COLUMN users_id;
