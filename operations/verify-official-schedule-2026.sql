-- 読み取り専用。10行すべてが「正常」であることを確認する。
WITH RECURSIVE
expected_events(
  event_name, start_time, end_time, rule_length,
  codepoint_sum, weighted_sum, venue_count, gathering_count
) AS (
  VALUES
    ('出席確認①', '0930', '1000', 7, 53474, 341088, 1, 0),
    ('開会式', '1000', '1020', 10, 277958, 1489295, 1, 0),
    ('第一競技「走れ！○人○脚！」', '1030', '1130', 371, 4980816, 948472566, 1, 3),
    ('第二競技「ロイヤルドッジ」', '1130', '1300', 774, 12976658, 5069107125, 2, 8),
    ('昼休憩＋コスプレ大会', '1300', '1400', 13, 224913, 1509938, 1, 0),
    ('出席確認②', '1300', '1330', 15, 115910, 1065918, 1, 0),
    ('第三競技「紙飛行機飛ばし」', '1400', '1500', 585, 10148912, 3040355551, 1, 4),
    ('第四競技「学科別対抗リレー」', '1500', '1530', 319, 3394946, 602491730, 1, 1),
    ('出席確認③', '1530', '1540', 7, 53483, 341114, 1, 0),
    ('表彰式・閉会式', '1540', '1600', 10, 240879, 1260624, 1, 0)
),
expected_venues(event_name, venue_name) AS (
  VALUES
    ('出席確認①', '体育館'),
    ('開会式', '体育館'),
    ('第一競技「走れ！○人○脚！」', 'コートC'),
    ('第二競技「ロイヤルドッジ」', 'メインアリーナ'),
    ('第二競技「ロイヤルドッジ」', 'サブアリーナ'),
    ('昼休憩＋コスプレ大会', '体育館'),
    ('出席確認②', '体育館'),
    ('第三競技「紙飛行機飛ばし」', 'コートB'),
    ('第四競技「学科別対抗リレー」', 'コートA'),
    ('出席確認③', '体育館'),
    ('表彰式・閉会式', '体育館')
),
expected_gatherings(event_name, round, gathering_time, gathering_spot_name) AS (
  VALUES
    ('第一競技「走れ！○人○脚！」', 1, '10:20', '体育館A'),
    ('第一競技「走れ！○人○脚！」', 2, '10:40', '体育館A'),
    ('第一競技「走れ！○人○脚！」', 3, '11:00', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 1, '11:20', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 2, '11:31', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 3, '11:42', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 4, '11:53', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 5, '12:05', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 6, '12:16', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 7, '12:27', '未定（仮）'),
    ('第二競技「ロイヤルドッジ」', 8, '12:38', '未定（仮）'),
    ('第三競技「紙飛行機飛ばし」', 1, '13:50', '未定（仮）'),
    ('第三競技「紙飛行機飛ばし」', 2, '14:05', '未定（仮）'),
    ('第三競技「紙飛行機飛ばし」', 3, '14:20', '未定（仮）'),
    ('第三競技「紙飛行機飛ばし」', 4, '14:35', '未定（仮）'),
    ('第四競技「学科別対抗リレー」', 1, '14:50', '未定（仮）')
),
target_events AS (
  SELECT event.*
  FROM events AS event
  JOIN expected_events AS expected ON expected.event_name = event.event_name
),
rule_chars(event_id, rule_text, pos) AS (
  SELECT event_id, rule_text, 1 FROM target_events
  UNION ALL
  SELECT event_id, rule_text, pos + 1
  FROM rule_chars
  WHERE pos < length(rule_text)
),
rule_fingerprints(event_id, codepoint_sum, weighted_sum) AS (
  SELECT event_id,
         SUM(unicode(substr(rule_text, pos, 1))),
         SUM(pos * unicode(substr(rule_text, pos, 1)))
  FROM rule_chars
  GROUP BY event_id
)
SELECT expected.event_name,
       (SELECT MIN(event_id) FROM events WHERE event_name = expected.event_name) AS event_id,
       expected.start_time,
       expected.end_time,
       expected.venue_count,
       expected.gathering_count,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM events
           WHERE event_name IN ('走れ！○人○脚！', 'ロイヤルドッジ', '第二競技「ドッジボール」', '紙飛行機飛ばし', '学科別対抗リレー')
         ) THEN '旧名称イベントあり'
         WHEN (SELECT COUNT(*) FROM events WHERE event_name = expected.event_name) = 0
           THEN '未登録'
         WHEN (SELECT COUNT(*) FROM events WHERE event_name = expected.event_name) > 1
           THEN '名称重複'
         WHEN EXISTS (
           SELECT 1 FROM events AS event
           WHERE event.event_name = expected.event_name
             AND (event.start_time IS NOT expected.start_time
               OR event.end_time IS NOT expected.end_time)
         ) THEN '時刻不一致'
         WHEN EXISTS (
           SELECT 1
           FROM events AS event
           LEFT JOIN rule_fingerprints AS fingerprint
             ON fingerprint.event_id = event.event_id
           WHERE event.event_name = expected.event_name
             AND (length(event.rule_text) IS NOT expected.rule_length
               OR fingerprint.codepoint_sum IS NOT expected.codepoint_sum
               OR fingerprint.weighted_sum IS NOT expected.weighted_sum)
         ) THEN 'ルール不一致'
         WHEN (
           SELECT COUNT(*)
           FROM events AS event
           JOIN event_venues AS event_venue ON event_venue.event_id = event.event_id
           WHERE event.event_name = expected.event_name
         ) <> expected.venue_count THEN '実施場所数不一致'
         WHEN EXISTS (
           SELECT 1
           FROM expected_venues AS expected_venue
           WHERE expected_venue.event_name = expected.event_name
             AND NOT EXISTS (
               SELECT 1
               FROM events AS event
               JOIN event_venues AS event_venue ON event_venue.event_id = event.event_id
               JOIN venues AS venue ON venue.venue_id = event_venue.venue_id
               WHERE event.event_name = expected_venue.event_name
                 AND venue.venue_name = expected_venue.venue_name
             )
         ) THEN '実施場所不一致'
         WHEN (
           SELECT COUNT(*)
           FROM events AS event
           JOIN gatherings AS gathering ON gathering.event_id = event.event_id
           WHERE event.event_name = expected.event_name
         ) <> expected.gathering_count THEN 'Round数不一致'
         WHEN EXISTS (
           SELECT 1
           FROM expected_gatherings AS expected_gathering
           WHERE expected_gathering.event_name = expected.event_name
             AND NOT EXISTS (
               SELECT 1
               FROM events AS event
               JOIN gatherings AS gathering ON gathering.event_id = event.event_id
               JOIN gathering_spots AS spot
                 ON spot.gathering_spot_id = gathering.gathering_spot_id
               WHERE event.event_name = expected_gathering.event_name
                 AND gathering.round = expected_gathering.round
                 AND gathering.gathering_time = expected_gathering.gathering_time
                 AND gathering.round_start_time IS NULL
                 AND spot.gathering_spot_name = expected_gathering.gathering_spot_name
             )
         ) THEN 'Round内容不一致'
         WHEN EXISTS (
           SELECT 1
           FROM events AS event
           JOIN gatherings AS gathering ON gathering.event_id = event.event_id
           JOIN gathering_group_members AS member
             ON member.gathering_id = gathering.gathering_id
           WHERE event.event_name = expected.event_name
         ) THEN '参加者あり'
         ELSE '正常'
       END AS registration_status
FROM expected_events AS expected
ORDER BY expected.start_time, expected.event_name;

-- 11行がevent.mdと同じ実施場所であることを確認する。
SELECT event.event_name, venue.venue_name
FROM events AS event
JOIN event_venues AS event_venue ON event_venue.event_id = event.event_id
JOIN venues AS venue ON venue.venue_id = event_venue.venue_id
WHERE event.event_name IN (
  '出席確認①', '開会式', '第一競技「走れ！○人○脚！」', '第二競技「ロイヤルドッジ」',
  '昼休憩＋コスプレ大会', '出席確認②', '第三競技「紙飛行機飛ばし」',
  '第四競技「学科別対抗リレー」', '出席確認③', '表彰式・閉会式'
)
ORDER BY event.start_time, event.event_name, venue.venue_name;

-- 16行が更新後の指定と同じRound・集合時刻・集合場所であることを確認する。
SELECT event.event_name, gathering.gathering_id, gathering.round,
       gathering.round_start_time, gathering.gathering_time,
       spot.gathering_spot_name,
       (SELECT COUNT(*) FROM gathering_group_members AS member
        WHERE member.gathering_id = gathering.gathering_id) AS member_count
FROM events AS event
JOIN gatherings AS gathering ON gathering.event_id = event.event_id
JOIN gathering_spots AS spot
  ON spot.gathering_spot_id = gathering.gathering_spot_id
WHERE event.event_name IN (
  '第一競技「走れ！○人○脚！」', '第二競技「ロイヤルドッジ」',
  '第三競技「紙飛行機飛ばし」', '第四競技「学科別対抗リレー」'
)
ORDER BY event.start_time, gathering.round;

-- 必要な集合場所4件が各1件存在し、すべて「正常」であることを確認する。
WITH required_gathering_spots(gathering_spot_name) AS (
  VALUES ('体育館A'), ('体育館B'), ('体育館C'), ('未定（仮）')
)
SELECT expected.gathering_spot_name,
       CASE COUNT(spot.gathering_spot_id)
         WHEN 0 THEN '未登録'
         WHEN 1 THEN '正常'
         ELSE '名称重複'
       END AS registration_status
FROM required_gathering_spots AS expected
LEFT JOIN gathering_spots AS spot
  ON spot.gathering_spot_name = expected.gathering_spot_name
GROUP BY expected.gathering_spot_name
ORDER BY expected.gathering_spot_name;

PRAGMA foreign_key_check;
