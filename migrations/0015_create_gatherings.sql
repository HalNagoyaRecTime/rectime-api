CREATE TABLE gatherings (
  gathering_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering_group_id INTEGER NOT NULL UNIQUE REFERENCES gathering_groups(gathering_group_id),
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  gathering_spot_id INTEGER NOT NULL REFERENCES gathering_spots(gathering_spot_id),
  gathering_time TEXT NOT NULL DEFAULT '99:59',
  round INTEGER NOT NULL DEFAULT 99,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_gatherings_event_id ON gatherings(event_id);
CREATE INDEX idx_gatherings_spot_id ON gatherings(gathering_spot_id);
