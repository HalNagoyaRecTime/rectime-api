-- KVの書き込み・削除は無料枠で1日1,000回までで、当日のログインと更新に足りないためD1に置く。
CREATE TABLE auth_states (
    state TEXT PRIMARY KEY,
    client_type TEXT NOT NULL CHECK (client_type IN ('web', 'mobile')),
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'account_deletion')),
    nonce TEXT NOT NULL,
    code_verifier TEXT,
    desktop_redirect_uri TEXT,
    frontend_origin TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE refresh_sessions (
    refresh_token_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    client_type TEXT NOT NULL CHECK (client_type IN ('web', 'mobile')),
    oid TEXT NOT NULL,
    tid TEXT NOT NULL,
    sub TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_updated_at TEXT,
    ms_refresh_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX idx_refresh_sessions_user_id ON refresh_sessions(user_id);
