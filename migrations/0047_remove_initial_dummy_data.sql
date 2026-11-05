-- 初期seedのIDと内容が一致する行だけを削除対象にする。
-- 運用データとの関連があれば、削除前にmigration全体を中断する。
CREATE TABLE __migration_0047_students AS
WITH expected(user_id, user_name, student_id_number, class_room_id, class_code, class_name, attendance_number) AS (
  VALUES
    (1, '田中太郎', '10000', 1, '11A', '1年Aクラス', 1),
    (2, '佐藤花子', '10001', 1, '11A', '1年Aクラス', 2),
    (3, '鈴木一郎', '10002', 2, '11B', '1年Bクラス', 3),
    (4, '高橋美咲', '10003', 2, '11B', '1年Bクラス', 4)
)
SELECT s.student_id, s.user_id
FROM students s
INNER JOIN users u ON u.user_id = s.user_id
INNER JOIN class_rooms c ON c.class_room_id = s.class_room_id
INNER JOIN expected e
  ON u.user_id = e.user_id AND u.user_name = e.user_name
  AND s.student_id = e.user_id AND s.student_id_number = e.student_id_number
  AND s.attendance_number = e.attendance_number
  AND c.class_room_id = e.class_room_id
  AND c.class_code = e.class_code AND c.class_name = e.class_name;

-- 山田健太は初期seedに学生情報を持たないため、元のIDも照合する。
CREATE TABLE __migration_0047_users AS
SELECT user_id FROM __migration_0047_students
UNION
SELECT user_id FROM users WHERE user_id = 5 AND user_name = '山田健太';

CREATE TABLE __migration_0047_class_rooms AS
WITH expected(class_room_id, class_code, class_name) AS (
  VALUES (1, '11A', '1年Aクラス'), (2, '11B', '1年Bクラス'), (3, '12A', '2年Aクラス')
)
SELECT c.class_room_id
FROM class_rooms c
INNER JOIN expected e
  ON c.class_room_id = e.class_room_id
  AND c.class_code = e.class_code AND c.class_name = e.class_name;

CREATE TABLE __migration_0047_teams AS
WITH expected(team_id, team_name) AS (
  VALUES (1, '1年Aクラス(11A)'), (2, '1年Bクラス(11B)'), (3, '2年Aクラス(12A)')
)
SELECT t.team_id
FROM teams t
INNER JOIN expected e ON t.team_id = e.team_id AND t.team_name = e.team_name;

CREATE TABLE __migration_0047_events AS
WITH expected(event_id, event_name, rule_text, start_time, end_time, venue_name) AS (
  VALUES
    (1, 'バスケットボール大会', '3on3バスケットボールトーナメント', '1100', '1300', '体育館'),
    (2, '文化祭準備', '来月の文化祭に向けた展示物準備', '1400', '1600', '第1教室'),
    (3, '英語スピーチコンテスト', '学年対抗英語プレゼンテーション大会', '1630', '1800', '講堂'),
    (4, 'プログラミング勉強会', 'React/TypeScript実践セッション', '1900', '2100', 'PC教室')
)
SELECT ev.event_id
FROM events ev
INNER JOIN expected e
  ON ev.event_id = e.event_id AND ev.event_name = e.event_name
  AND ev.rule_text = e.rule_text
  AND ev.start_time = e.start_time AND ev.end_time = e.end_time
WHERE (SELECT COUNT(*) FROM event_venues v WHERE v.event_id = ev.event_id) = 1
  AND EXISTS (
    SELECT 1 FROM event_venues v
    INNER JOIN venues venue ON venue.venue_id = v.venue_id
    WHERE v.event_id = ev.event_id AND venue.venue_name = e.venue_name
  );

CREATE TABLE __migration_0047_venues AS
SELECT venue_id FROM venues
WHERE venue_name IN ('体育館', '第1教室', '講堂', 'PC教室');

CREATE TABLE __migration_0047_gatherings AS
SELECT gathering_id FROM gatherings
WHERE event_id IN (SELECT event_id FROM __migration_0047_events);

-- FKのCASCADE/SET NULLや、FKのない通知対象の参照による正規データの変更も防ぐ。
-- 中断時は対象ID・関連データを確認し、混在を解消してから再実行する。
CREATE TABLE __migration_0047_guard (
  ok INTEGER NOT NULL
    CONSTRAINT dummy_data_has_no_unreviewed_relations CHECK (ok = 1)
);

INSERT INTO __migration_0047_guard (ok)
SELECT 0
WHERE EXISTS (
  SELECT 1 FROM students
  WHERE class_room_id IN (SELECT class_room_id FROM __migration_0047_class_rooms)
    AND student_id NOT IN (SELECT student_id FROM __migration_0047_students)
) OR EXISTS (
  SELECT 1 FROM class_rooms
  WHERE class_room_id IN (SELECT class_room_id FROM __migration_0047_class_rooms)
    AND teacher_id IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM class_rooms
  WHERE team_id IN (SELECT team_id FROM __migration_0047_teams)
    AND class_room_id NOT IN (SELECT class_room_id FROM __migration_0047_class_rooms)
) OR EXISTS (
  SELECT 1 FROM team_scores
  WHERE team_id IN (SELECT team_id FROM __migration_0047_teams)
) OR EXISTS (
  SELECT 1 FROM event_venues
  WHERE venue_id IN (SELECT venue_id FROM __migration_0047_venues)
    AND event_id NOT IN (SELECT event_id FROM __migration_0047_events)
) OR EXISTS (
  SELECT 1 FROM students
  WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
    AND student_id NOT IN (SELECT student_id FROM __migration_0047_students)
) OR EXISTS (
  SELECT 1 FROM microsoft_account_links
  WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM staffs WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM teachers WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM firebase_tokens WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM gathering_group_members
  WHERE (
    gathering_id IN (SELECT gathering_id FROM __migration_0047_gatherings)
    AND user_id NOT IN (SELECT user_id FROM __migration_0047_users)
  ) OR (
    user_id IN (SELECT user_id FROM __migration_0047_users)
    AND gathering_id NOT IN (SELECT gathering_id FROM __migration_0047_gatherings)
  )
) OR EXISTS (
  SELECT 1 FROM notifications
  WHERE created_by_user_id IN (SELECT user_id FROM __migration_0047_users)
    OR (source_type = 'gathering' AND source_id IN (SELECT gathering_id FROM __migration_0047_gatherings))
    OR (source_type = 'event' AND source_id IN (SELECT event_id FROM __migration_0047_events))
) OR EXISTS (
  SELECT 1 FROM notification_schedules
  WHERE event_id IN (SELECT event_id FROM __migration_0047_events)
    OR created_user_id IN (SELECT user_id FROM __migration_0047_users)
    OR scheduled_by_user_id IN (SELECT user_id FROM __migration_0047_users)
    OR stopped_by_user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM notification_recipients
  WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
) OR EXISTS (
  SELECT 1 FROM notification_audiences
  WHERE (audience_type = 'user' AND target_id IN (SELECT user_id FROM __migration_0047_users))
    OR (audience_type = 'class_room' AND target_id IN (SELECT class_room_id FROM __migration_0047_class_rooms))
    OR (audience_type = 'event' AND target_id IN (SELECT event_id FROM __migration_0047_events))
    OR (audience_type = 'gathering' AND target_id IN (SELECT gathering_id FROM __migration_0047_gatherings))
);

DELETE FROM gathering_group_members
WHERE user_id IN (SELECT user_id FROM __migration_0047_users)
  OR gathering_id IN (SELECT gathering_id FROM __migration_0047_gatherings);

DELETE FROM gatherings WHERE gathering_id IN (SELECT gathering_id FROM __migration_0047_gatherings);
DELETE FROM event_venues WHERE event_id IN (SELECT event_id FROM __migration_0047_events);
DELETE FROM events WHERE event_id IN (SELECT event_id FROM __migration_0047_events);
DELETE FROM students WHERE student_id IN (SELECT student_id FROM __migration_0047_students);
DELETE FROM users WHERE user_id IN (SELECT user_id FROM __migration_0047_users);
DELETE FROM class_rooms WHERE class_room_id IN (SELECT class_room_id FROM __migration_0047_class_rooms);
DELETE FROM teams WHERE team_id IN (SELECT team_id FROM __migration_0047_teams);
DELETE FROM venues WHERE venue_id IN (SELECT venue_id FROM __migration_0047_venues);

-- gathering_spotsとシステム移行ユーザーは削除対象に含めない。
DROP TABLE __migration_0047_guard;
DROP TABLE __migration_0047_gatherings;
DROP TABLE __migration_0047_venues;
DROP TABLE __migration_0047_events;
DROP TABLE __migration_0047_teams;
DROP TABLE __migration_0047_class_rooms;
DROP TABLE __migration_0047_users;
DROP TABLE __migration_0047_students;
