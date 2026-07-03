ALTER TABLE users ADD COLUMN users_id     TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN uid          TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_users_id ON users(users_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uid      ON users(uid);

CREATE TABLE IF NOT EXISTS microsoft_account_links (
  microsoft_account_link_id TEXT NOT NULL PRIMARY KEY,
  user_id                   TEXT NOT NULL UNIQUE,
  oid                       TEXT NOT NULL,
  tid                       TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(users_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_microsoft_account_links_oid_tid
  ON microsoft_account_links(oid, tid);

CREATE INDEX IF NOT EXISTS idx_microsoft_account_links_user_id
  ON microsoft_account_links(user_id);
