-- Issue #552。0047の削除結果と復元用bookmarkを確認してから、全SQLを一括実行する。
-- 開催日・正式会場・未確定の競技ルール・参加者は登録しない。
CREATE TABLE __official_schedule_2026_expected (
  event_name TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  rule_text TEXT,
  gathering_time TEXT
);

INSERT INTO __official_schedule_2026_expected
  (event_name, start_time, end_time, rule_text, gathering_time)
VALUES
  ('出席確認①', '1000', '1000', '10:00締切', NULL),
  ('開会式', '1000', '1020', '諸注意説明、競技誘導', NULL),
  ('第一競技「走れ！○人○脚！」', '1030', '1130', NULL, '10:20'),
  ('第二競技「ドッジボール」', '1130', '1300', NULL, '11:20'),
  ('昼休憩＋コスプレ大会', '1300', '1400', '当日の審査は8チームで実施', NULL),
  ('出席確認②', '1330', '1330', '13:30締切', NULL),
  ('第三競技「紙飛行機飛ばし」', '1400', '1500', NULL, '13:50'),
  ('第四競技「学科別対抗リレー」', '1500', '1530', NULL, '14:50'),
  ('出席確認③', '1540', '1540', '15:40締切', NULL),
  ('表彰式・閉会式', '1540', '1600', NULL, NULL);

CREATE TABLE __official_schedule_2026_guard (
  valid INTEGER NOT NULL
    CONSTRAINT official_schedule_2026_preconditions CHECK (valid = 1)
);

-- 削除migrationと同名イベント・集合場所・既存Roundを、業務データの変更前に検査する。
INSERT INTO __official_schedule_2026_guard (valid)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE name = '0047_remove_initial_dummy_data.sql'
  )
  AND NOT EXISTS (
    SELECT expected.event_name
    FROM __official_schedule_2026_expected AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    GROUP BY expected.event_name
    HAVING COUNT(*) > 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    WHERE event.start_time IS NOT expected.start_time
       OR event.end_time IS NOT expected.end_time
  )
  AND (SELECT COUNT(*) FROM gathering_spots
       WHERE gathering_spot_name = '未定（仮）') <= 1
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    JOIN gatherings AS gathering ON gathering.event_id = event.event_id
    JOIN gathering_spots AS spot
      ON spot.gathering_spot_id = gathering.gathering_spot_id
    WHERE expected.gathering_time IS NULL
       OR gathering.round IS NOT 1
       OR gathering.round_start_time IS NOT expected.start_time
       OR gathering.gathering_time IS NOT expected.gathering_time
       OR spot.gathering_spot_name IS NOT '未定（仮）'
       OR EXISTS (
         SELECT 1 FROM gathering_group_members AS member
         WHERE member.gathering_id = gathering.gathering_id
       )
  )
  AND NOT EXISTS (
    SELECT event.event_id
    FROM __official_schedule_2026_expected AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    JOIN gatherings AS gathering ON gathering.event_id = event.event_id
    GROUP BY event.event_id
    HAVING COUNT(*) > 1
  )
THEN 1 ELSE 0 END;

-- 同名・同時刻の既存イベントは、ID・ルール・実施場所を保持する。
INSERT INTO events (event_name, start_time, end_time, rule_text)
SELECT expected.event_name, expected.start_time, expected.end_time,
       expected.rule_text
FROM __official_schedule_2026_expected AS expected
WHERE NOT EXISTS (
  SELECT 1 FROM events AS event
  WHERE event.event_name = expected.event_name
);

INSERT INTO gathering_spots (gathering_spot_name)
SELECT '未定（仮）'
WHERE NOT EXISTS (
  SELECT 1 FROM gathering_spots WHERE gathering_spot_name = '未定（仮）'
);

INSERT INTO gatherings
  (event_id, gathering_spot_id, round, gathering_time, round_start_time)
SELECT event.event_id, spot.gathering_spot_id, 1, expected.gathering_time,
       expected.start_time
FROM __official_schedule_2026_expected AS expected
JOIN events AS event ON event.event_name = expected.event_name
JOIN gathering_spots AS spot ON spot.gathering_spot_name = '未定（仮）'
WHERE expected.gathering_time IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gatherings AS gathering
    WHERE gathering.event_id = event.event_id
  );

DROP TABLE __official_schedule_2026_guard;
DROP TABLE __official_schedule_2026_expected;
