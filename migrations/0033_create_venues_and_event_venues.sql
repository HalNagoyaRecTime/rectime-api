CREATE TABLE venues (
  venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_venues_venue_name ON venues(venue_name);

CREATE TABLE event_venues (
  event_venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- 紐づけは競技に属する情報で、競技が消えれば残す意味がない。アプリ側で
  -- 子を消してから親を消す2段階にすると、途中で失敗したときに紐づけだけが
  -- 消えた状態が残るため、DB側で追従させる。
  event_id INTEGER NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  -- マスタ側は参照中の削除を拒否したいので ON DELETE は指定しない。
  venue_id INTEGER NOT NULL REFERENCES venues(venue_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_event_venues_event_venue ON event_venues(event_id, venue_id);

CREATE INDEX idx_event_venues_venue_id ON event_venues(venue_id);
