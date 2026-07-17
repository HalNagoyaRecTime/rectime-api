CREATE TABLE gathering_spots (
  gathering_spot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering_spot_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gathering_groups (
  gathering_group_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering_group_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gathering_group_members (
  gathering_group_member_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering_group_id INTEGER NOT NULL REFERENCES gathering_groups(gathering_group_id),
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (gathering_group_id, user_id)
);

CREATE INDEX idx_gathering_group_members_user_id
  ON gathering_group_members(user_id);
