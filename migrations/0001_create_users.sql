CREATE TABLE class_rooms (
  class_room_id TEXT NOT NULL PRIMARY KEY,
  class_code    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL
);

CREATE TABLE users (
  users_id      TEXT NOT NULL PRIMARY KEY,
  class_room_id TEXT,
  display_name  TEXT NOT NULL,
  uid           TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id)
);

CREATE TABLE microsoft_account_links (
  microsoft_account_link_id TEXT NOT NULL PRIMARY KEY,
  users_id                  TEXT NOT NULL UNIQUE,
  oid                       TEXT NOT NULL,
  tid                       TEXT NOT NULL,
  sub                       TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  FOREIGN KEY (users_id) REFERENCES users(users_id)
);

CREATE UNIQUE INDEX idx_microsoft_account_links_oid_tid
  ON microsoft_account_links(oid, tid);

CREATE INDEX idx_microsoft_account_links_users_id
  ON microsoft_account_links(users_id);
