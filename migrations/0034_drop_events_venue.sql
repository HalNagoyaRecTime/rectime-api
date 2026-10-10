-- events.venue を venues / event_venues へ移してから削除する。
--
-- このファイル名は、すでに適用済みの環境(stg等)の d1_migrations に旧名のまま
-- 残っているため変更できない。適用済みの環境では実行されない。
-- 未適用の環境では、列を消す前にマスタ作成とデータ移行を済ませる必要があるため、
-- 0035_create_venues_and_event_venues.sql の内容をここで先に行う。
-- 旧0033_create_venues_and_event_venues.sql だけ適用済みの環境でも通るよう、
-- 作成は IF NOT EXISTS にしている。
--
-- その環境では、旧0033の移行後に、events.venue(旧API)と実施場所マスタ・紐づけ
-- (マスタのCRUD API)が別々に編集されている場合がある。どちらが正しいかはSQLだけでは
-- 判断できないため、すでに紐づけのある競技で両者が食い違っていたら、データを変更せずに
-- 移行を中断する(下の __migration_0034_guard)。中断した場合は、食い違いを事前に
-- 解消してから適用し直す。紐づけがまだ無い競技は、events.venue から作る。

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

-- すでに紐づけのある競技で、events.venue と紐づけ先のマスタ名が食い違っていたら中断する。
-- 食い違いの例: events.venue だけ更新された、空文字にされた、マスタが改名された。
-- 中断は、名前付きのCHECK制約に違反させて行う(エラーメッセージに制約名が出る)。
-- D1のmigrationは1つの単位として適用されるため、中断した場合はここまでの変更も残らない。
-- SQLite の TRIM() は既定で半角スペースしか除去しないため、アプリ側の
-- z.string().trim() に合わせて全角スペースと改行・タブも除去対象に含める。
CREATE TABLE __migration_0034_guard (
  ok INTEGER NOT NULL,
  CONSTRAINT venue_mismatch_resolve_events_venue_and_event_venues_before_migrating
    CHECK (ok = 1)
);

INSERT INTO __migration_0034_guard (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM events
  WHERE EXISTS (
      SELECT 1 FROM event_venues
      WHERE event_venues.event_id = events.event_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM event_venues
        INNER JOIN venues ON venues.venue_id = event_venues.venue_id
        WHERE event_venues.event_id = events.event_id
          AND venues.venue_name <> TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288))
      )
      OR (
        TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288)) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM event_venues
          INNER JOIN venues ON venues.venue_id = event_venues.venue_id
          WHERE event_venues.event_id = events.event_id
            AND venues.venue_name = TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288))
        )
      )
    )
);

DROP TABLE __migration_0034_guard;

INSERT OR IGNORE INTO venues (venue_name)
SELECT DISTINCT TRIM(venue, ' ' || CHAR(9, 10, 13, 12288))
FROM events
WHERE TRIM(venue, ' ' || CHAR(9, 10, 13, 12288)) <> '';

INSERT OR IGNORE INTO event_venues (event_id, venue_id)
SELECT events.event_id, venues.venue_id
FROM events
INNER JOIN venues ON venues.venue_name = TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288));

ALTER TABLE events DROP COLUMN venue;
