-- venues / event_venues の作成。実体は 0034_drop_events_venue.sql で行う。
--
-- 旧名(0033_create_venues_and_event_venues.sql)で適用済みの環境では、このファイルが
-- 未適用として実行される。その環境ではすでに存在するため、何もしない。
-- 0034_drop_events_venue.sql と同じ定義にそろえている。

CREATE TABLE IF NOT EXISTS venues (
  venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_venue_name ON venues(venue_name);

CREATE TABLE IF NOT EXISTS event_venues (
  event_venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  venue_id INTEGER NOT NULL REFERENCES venues(venue_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_venues_event_venue ON event_venues(event_id, venue_id);

CREATE INDEX IF NOT EXISTS idx_event_venues_venue_id ON event_venues(venue_id);
