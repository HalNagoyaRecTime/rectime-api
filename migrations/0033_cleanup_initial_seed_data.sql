-- 初期migration由来のサンプルデータだけを削除する。
--
-- migration全体のrollbackだけに依存せず、各DELETEを単独で安全かつ
-- 再実行可能にする。初期値から変更された行や
-- 実運用データに紐付いた行は削除せずに残す。

-- 初期イベントは、全業務値と未更新状態が一致し、集合・通知予定のどちらからも
-- 参照されていない場合だけ削除する。
WITH seed_events (
  event_id,
  event_name,
  rule_text,
  venue,
  start_time,
  end_time
) AS (
  VALUES
    (1, 'バスケットボール大会', '3on3バスケットボールトーナメント', '体育館', '1100', '1300'),
    (2, '文化祭準備', '来月の文化祭に向けた展示物準備', '第1教室', '1400', '1600'),
    (3, '英語スピーチコンテスト', '学年対抗英語プレゼンテーション大会', '講堂', '1630', '1800'),
    (4, 'プログラミング勉強会', 'React/TypeScript実践セッション', 'PC教室', '1900', '2100')
)
DELETE FROM events
WHERE EXISTS (
  SELECT 1
  FROM seed_events AS seed
  WHERE seed.event_id = events.event_id
    AND seed.event_name = events.event_name
    AND seed.rule_text = events.rule_text
    AND seed.venue = events.venue
    AND seed.start_time = events.start_time
    AND seed.end_time = events.end_time
)
  AND events.created_at = events.updated_at
  AND NOT EXISTS (
    SELECT 1
    FROM gatherings
    WHERE gatherings.event_id = events.event_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM notification_schedules
    WHERE notification_schedules.event_id = events.event_id
  );

-- 初期学生は、学生・利用者・教室の全fingerprintが一致し、利用者に実運用上の
-- 関連付けが一切ない場合だけ削除する。利用者側の条件もここで確認することで、
-- Microsoft連携済み利用者のstudentsだけを先に消す部分削除を防ぐ。
WITH seed_students (
  student_id,
  user_id,
  user_name,
  class_room_id,
  class_code,
  class_name,
  attendance_number,
  student_id_number
) AS (
  VALUES
    (1, 1, '田中太郎', 1, '11A', '1年Aクラス', 1, '10000'),
    (2, 2, '佐藤花子', 1, '11A', '1年Aクラス', 2, '10001'),
    (3, 3, '鈴木一郎', 2, '11B', '1年Bクラス', 3, '10002'),
    (4, 4, '高橋美咲', 2, '11B', '1年Bクラス', 4, '10003')
)
DELETE FROM students
WHERE students.created_at = students.updated_at
  AND EXISTS (
    SELECT 1
    FROM seed_students AS seed
    INNER JOIN users ON users.user_id = seed.user_id
    INNER JOIN class_rooms
      ON class_rooms.class_room_id = seed.class_room_id
    WHERE seed.student_id = students.student_id
      AND seed.user_id = students.user_id
      AND seed.class_room_id = students.class_room_id
      AND seed.attendance_number = students.attendance_number
      AND seed.student_id_number = students.student_id_number
      AND users.user_name = seed.user_name
      AND users.is_live_active = 1
      AND users.deletion_status = 'active'
      AND users.deletion_requested_at IS NULL
      AND users.deleted_at IS NULL
      AND users.purged_at IS NULL
      AND users.created_at = users.updated_at
      AND class_rooms.class_code = seed.class_code
      AND class_rooms.class_name = seed.class_name
      AND class_rooms.teacher_id IS NULL
      AND class_rooms.created_at = class_rooms.updated_at
      AND NOT EXISTS (
        SELECT 1
        FROM microsoft_account_links
        WHERE microsoft_account_links.user_id = seed.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM firebase_tokens
        WHERE firebase_tokens.user_id = seed.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM staffs
        WHERE staffs.user_id = seed.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM teachers
        WHERE teachers.user_id = seed.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM gathering_group_members
        WHERE gathering_group_members.user_id = seed.user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM notification_schedules
        WHERE notification_schedules.created_user_id = seed.user_id
      )
  );

-- 学生削除後に参照が残っていない初期利用者だけを削除する。
-- 山田健太(user_id=5)は初期状態からstudentsを持たないため、他の関連付けが
-- なく、利用者fingerprintも一致する場合に限って削除する。
WITH seed_users (user_id, user_name) AS (
  VALUES
    (1, '田中太郎'),
    (2, '佐藤花子'),
    (3, '鈴木一郎'),
    (4, '高橋美咲'),
    (5, '山田健太')
)
DELETE FROM users
WHERE EXISTS (
  SELECT 1
  FROM seed_users AS seed
  WHERE seed.user_id = users.user_id
    AND seed.user_name = users.user_name
)
  AND users.is_live_active = 1
  AND users.deletion_status = 'active'
  AND users.deletion_requested_at IS NULL
  AND users.deleted_at IS NULL
  AND users.purged_at IS NULL
  AND users.created_at = users.updated_at
  AND NOT EXISTS (
    SELECT 1 FROM students WHERE students.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM staffs WHERE staffs.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM teachers WHERE teachers.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM microsoft_account_links
    WHERE microsoft_account_links.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM firebase_tokens
    WHERE firebase_tokens.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM gathering_group_members
    WHERE gathering_group_members.user_id = users.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM notification_schedules
    WHERE notification_schedules.created_user_id = users.user_id
  );

-- 初期教室は、全値が未変更で、担任・在籍学生のどちらも存在しない場合だけ
-- 削除する。利用中の教室や一度でも更新された教室は保持する。
WITH seed_class_rooms (
  class_room_id,
  class_code,
  class_name
) AS (
  VALUES
    (1, '11A', '1年Aクラス'),
    (2, '11B', '1年Bクラス'),
    (3, '12A', '2年Aクラス')
)
DELETE FROM class_rooms
WHERE EXISTS (
  SELECT 1
  FROM seed_class_rooms AS seed
  WHERE seed.class_room_id = class_rooms.class_room_id
    AND seed.class_code = class_rooms.class_code
    AND seed.class_name = class_rooms.class_name
)
  AND class_rooms.teacher_id IS NULL
  AND class_rooms.created_at = class_rooms.updated_at
  AND NOT EXISTS (
    SELECT 1
    FROM students
    WHERE students.class_room_id = class_rooms.class_room_id
  );
