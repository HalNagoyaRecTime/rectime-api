-- 読み取り専用。10行すべてが「正常」であることを確認する。
WITH expected(event_name, start_time, end_time, gathering_time) AS (
  VALUES
    ('出席確認①', '1000', '1000', NULL),
    ('開会式', '1000', '1020', NULL),
    ('第一競技「走れ！○人○脚！」', '1030', '1130', '10:20'),
    ('第二競技「ドッジボール」', '1130', '1300', '11:20'),
    ('昼休憩＋コスプレ大会', '1300', '1400', NULL),
    ('出席確認②', '1330', '1330', NULL),
    ('第三競技「紙飛行機飛ばし」', '1400', '1500', '13:50'),
    ('第四競技「学科別対抗リレー」', '1500', '1530', '14:50'),
    ('出席確認③', '1540', '1540', NULL),
    ('表彰式・閉会式', '1540', '1600', NULL)
)
SELECT x.event_name, e.event_id, e.start_time, e.end_time, e.rule_text,
       (SELECT COUNT(*) FROM event_venues ev WHERE ev.event_id = e.event_id) AS venue_count,
       (SELECT COUNT(*) FROM gatherings g WHERE g.event_id = e.event_id) AS gathering_count,
       CASE
         WHEN e.event_id IS NULL THEN '未登録'
         WHEN (SELECT COUNT(*) FROM events d WHERE d.event_name = x.event_name) <> 1 THEN '名称重複'
         WHEN e.start_time <> x.start_time OR e.end_time <> x.end_time THEN '時刻不一致'
         WHEN x.gathering_time IS NULL AND EXISTS (
           SELECT 1 FROM gatherings g WHERE g.event_id = e.event_id
         ) THEN '競技以外にRoundあり'
         WHEN x.gathering_time IS NOT NULL AND (
           (SELECT COUNT(*) FROM gatherings g WHERE g.event_id = e.event_id) <> 1
           OR NOT EXISTS (
             SELECT 1 FROM gatherings g
             JOIN gathering_spots s ON s.gathering_spot_id = g.gathering_spot_id
             WHERE g.event_id = e.event_id AND g.round = 1
               AND g.round_start_time = x.start_time
               AND g.gathering_time = x.gathering_time
               AND s.gathering_spot_name = '未定（仮）'
           )
         ) THEN '仮Round不一致'
         WHEN EXISTS (
           SELECT 1 FROM gatherings g
           JOIN gathering_group_members m ON m.gathering_id = g.gathering_id
           WHERE g.event_id = e.event_id
         ) THEN '参加者あり'
         ELSE '正常'
       END AS registration_status
FROM expected x
LEFT JOIN events e ON e.event_name = x.event_name
ORDER BY x.start_time, x.event_name, e.event_id;

SELECT e.event_name, g.gathering_id, g.round, g.round_start_time,
       g.gathering_time, s.gathering_spot_name,
       (SELECT COUNT(*) FROM gathering_group_members m
        WHERE m.gathering_id = g.gathering_id) AS member_count
FROM events e
JOIN gatherings g ON g.event_id = e.event_id
JOIN gathering_spots s ON s.gathering_spot_id = g.gathering_spot_id
WHERE e.event_name IN (
  '第一競技「走れ！○人○脚！」', '第二競技「ドッジボール」',
  '第三競技「紙飛行機飛ばし」', '第四競技「学科別対抗リレー」'
)
ORDER BY e.start_time, g.gathering_id;

PRAGMA foreign_key_check;
