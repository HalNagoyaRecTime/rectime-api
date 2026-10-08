-- events.venue を venues / event_venues へ移してから削除する。
--
-- このファイル名は、すでに適用済みの環境(stg等)の d1_migrations に旧名のまま
-- 残っているため変更できない。適用済みの環境では実行されない。
-- 未適用の環境では、列を消す前にマスタ作成とデータ移行を済ませる必要があるため、
-- 0035_create_venues_and_event_venues.sql の内容をここで先に行う。
-- 旧0033_create_venues_and_event_venues.sql だけ適用済みの環境でも通るよう、
-- 作成は IF NOT EXISTS にしている。
--
-- その環境では、旧0033の移行後に events.venue が更新されている場合がある。
-- 実施場所を紐づけで編集するAPIは、この列を削除する変更と同時に入ったため、
-- 列を削除する時点では events.venue が正しい値になる。既存の紐づけは
-- events.venue から作り直し、更新前の実施場所や空文字化した実施場所を残さない。

CREATE TABLE IF NOT EXISTS venues (
  venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venues_venue_name ON venues(venue_name);

CREATE TABLE IF NOT EXISTS event_venues (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_venues_event_venue ON event_venues(event_id, venue_id);

CREATE INDEX IF NOT EXISTS idx_event_venues_venue_id ON event_venues(venue_id);

-- SQLite の TRIM() は既定で半角スペースしか除去しないため、アプリ側の
-- z.string().trim() に合わせて全角スペースと改行・タブも除去対象に含める。
INSERT OR IGNORE INTO venues (venue_name)
SELECT DISTINCT TRIM(venue, ' ' || CHAR(9, 10, 13, 12288))
FROM events
WHERE TRIM(venue, ' ' || CHAR(9, 10, 13, 12288)) <> '';

-- events.venue を正として紐づけを作り直す。更新前の実施場所の紐づけを残さない。
DELETE FROM event_venues;

INSERT INTO event_venues (event_id, venue_id)
SELECT events.event_id, venues.venue_id
FROM events
INNER JOIN venues ON venues.venue_name = TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288));

ALTER TABLE events DROP COLUMN venue;
