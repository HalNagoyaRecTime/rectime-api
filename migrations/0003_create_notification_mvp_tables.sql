CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_provider    TEXT,
  provider_user_id TEXT,
  email            TEXT,
  student_number   TEXT    NOT NULL UNIQUE,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_provider_user_id
  ON users(auth_provider, provider_user_id);

CREATE TABLE IF NOT EXISTS firebase_tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  platform      TEXT    NOT NULL,
  fcm_token     TEXT    NOT NULL UNIQUE,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_seen_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_firebase_tokens_user_id
  ON firebase_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_firebase_tokens_active
  ON firebase_tokens(is_active);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
