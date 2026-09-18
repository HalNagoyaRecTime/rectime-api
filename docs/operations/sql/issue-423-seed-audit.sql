-- Issue #423の初期seed候補を、0033適用時の見込みに分類する。
-- SELECTとPRAGMAだけを使用し、氏名・学籍番号・連携先の実値は出力しない。

WITH
seed_events(event_id, event_name, rule_text, venue, start_time, end_time) AS (
  VALUES
    (1, 'バスケットボール大会', '3on3バスケットボールトーナメント', '体育館', '1100', '1300'),
    (2, '文化祭準備', '来月の文化祭に向けた展示物準備', '第1教室', '1400', '1600'),
    (3, '英語スピーチコンテスト', '学年対抗英語プレゼンテーション大会', '講堂', '1630', '1800'),
    (4, 'プログラミング勉強会', 'React/TypeScript実践セッション', 'PC教室', '1900', '2100')
),
seed_users(user_id, user_name) AS (
  VALUES
    (1, '田中太郎'),
    (2, '佐藤花子'),
    (3, '鈴木一郎'),
    (4, '高橋美咲'),
    (5, '山田健太')
),
seed_rooms(class_room_id, class_code, class_name) AS (
  VALUES
    (1, '11A', '1年Aクラス'),
    (2, '11B', '1年Bクラス'),
    (3, '12A', '2年Aクラス')
),
seed_students(
  student_id,
  user_id,
  class_room_id,
  attendance_number,
  student_id_number
) AS (
  VALUES
    (1, 1, 1, 1, '10000'),
    (2, 2, 1, 2, '10001'),
    (3, 3, 2, 3, '10002'),
    (4, 4, 2, 4, '10003')
),
user_state AS (
  SELECT
    seed.user_id,
    users.user_id IS NOT NULL AS exists_flag,
    COALESCE(
      users.user_name = seed.user_name
      AND users.is_live_active = 1
      AND users.deletion_status = 'active'
      AND users.deletion_requested_at IS NULL
      AND users.deleted_at IS NULL
      AND users.purged_at IS NULL,
      0
    ) AS value_match,
    COALESCE(users.created_at = users.updated_at, 0) AS unmodified,
    EXISTS (
      SELECT 1 FROM microsoft_account_links
      WHERE microsoft_account_links.user_id = seed.user_id
    ) AS microsoft_ref,
    EXISTS (
      SELECT 1 FROM firebase_tokens
      WHERE firebase_tokens.user_id = seed.user_id
    ) AS firebase_ref,
    EXISTS (
      SELECT 1 FROM staffs
      WHERE staffs.user_id = seed.user_id
    ) AS staff_ref,
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = seed.user_id
    ) AS teacher_ref,
    EXISTS (
      SELECT 1 FROM gathering_group_members
      WHERE gathering_group_members.user_id = seed.user_id
    ) AS gathering_member_ref,
    EXISTS (
      SELECT 1 FROM notification_schedules
      WHERE notification_schedules.created_user_id = seed.user_id
    ) AS notification_creator_ref
  FROM seed_users AS seed
  LEFT JOIN users ON users.user_id = seed.user_id
),
room_state AS (
  SELECT
    seed.class_room_id,
    rooms.class_room_id IS NOT NULL AS exists_flag,
    COALESCE(
      rooms.class_code = seed.class_code
      AND rooms.class_name = seed.class_name,
      0
    ) AS value_match,
    COALESCE(rooms.created_at = rooms.updated_at, 0) AS unmodified,
    COALESCE(rooms.teacher_id IS NOT NULL, 0) AS teacher_ref
  FROM seed_rooms AS seed
  LEFT JOIN class_rooms AS rooms
    ON rooms.class_room_id = seed.class_room_id
),
student_state AS (
  SELECT
    seed.student_id,
    seed.user_id,
    seed.class_room_id,
    students.student_id IS NOT NULL AS exists_flag,
    COALESCE(
      students.user_id = seed.user_id
      AND students.class_room_id = seed.class_room_id
      AND students.attendance_number = seed.attendance_number
      AND students.student_id_number = seed.student_id_number,
      0
    ) AS value_match,
    COALESCE(students.created_at = students.updated_at, 0) AS unmodified
  FROM seed_students AS seed
  LEFT JOIN students ON students.student_id = seed.student_id
),
student_delete_candidates AS (
  SELECT student.student_id
  FROM student_state AS student
  INNER JOIN user_state AS user ON user.user_id = student.user_id
  INNER JOIN room_state AS room
    ON room.class_room_id = student.class_room_id
  WHERE student.exists_flag = 1
    AND student.value_match = 1
    AND student.unmodified = 1
    AND user.exists_flag = 1
    AND user.value_match = 1
    AND user.unmodified = 1
    AND user.microsoft_ref = 0
    AND user.firebase_ref = 0
    AND user.staff_ref = 0
    AND user.teacher_ref = 0
    AND user.gathering_member_ref = 0
    AND user.notification_creator_ref = 0
    AND room.exists_flag = 1
    AND room.value_match = 1
    AND room.unmodified = 1
    AND room.teacher_ref = 0
),
user_delete_candidates AS (
  SELECT user.user_id
  FROM user_state AS user
  WHERE user.exists_flag = 1
    AND user.value_match = 1
    AND user.unmodified = 1
    AND user.microsoft_ref = 0
    AND user.firebase_ref = 0
    AND user.staff_ref = 0
    AND user.teacher_ref = 0
    AND user.gathering_member_ref = 0
    AND user.notification_creator_ref = 0
    AND NOT EXISTS (
      SELECT 1
      FROM students AS student
      WHERE student.user_id = user.user_id
        AND NOT EXISTS (
          SELECT 1
          FROM student_delete_candidates AS candidate
          WHERE candidate.student_id = student.student_id
        )
    )
),
room_delete_candidates AS (
  SELECT room.class_room_id
  FROM room_state AS room
  WHERE room.exists_flag = 1
    AND room.value_match = 1
    AND room.unmodified = 1
    AND room.teacher_ref = 0
    AND NOT EXISTS (
      SELECT 1
      FROM students AS student
      WHERE student.class_room_id = room.class_room_id
        AND NOT EXISTS (
          SELECT 1
          FROM student_delete_candidates AS candidate
          WHERE candidate.student_id = student.student_id
        )
    )
),
event_state AS (
  SELECT
    seed.event_id,
    events.event_id IS NOT NULL AS exists_flag,
    COALESCE(
      events.event_name = seed.event_name
      AND events.rule_text = seed.rule_text
      AND events.venue = seed.venue
      AND events.start_time = seed.start_time
      AND events.end_time = seed.end_time,
      0
    ) AS value_match,
    COALESCE(events.created_at = events.updated_at, 0) AS unmodified,
    EXISTS (
      SELECT 1 FROM gatherings
      WHERE gatherings.event_id = seed.event_id
    ) AS gathering_ref,
    EXISTS (
      SELECT 1 FROM notification_schedules
      WHERE notification_schedules.event_id = seed.event_id
    ) AS notification_ref
  FROM seed_events AS seed
  LEFT JOIN events ON events.event_id = seed.event_id
),
check_state AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM users
      WHERE user_id = -1
        AND user_name = 'システム移行ユーザー'
        AND is_live_active = 0
    ) AS system_user_ok,
    NOT EXISTS (
      SELECT 1 FROM pragma_foreign_key_check
    ) AS foreign_keys_ok,
    NOT EXISTS (
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('teams', 'team_scores')
    ) AS supported_schema,
    EXISTS (
      SELECT 1
      FROM d1_migrations
      WHERE name = '0033_cleanup_initial_seed_data.sql'
    ) AS migration_applied
),
checks(check_id, check_name) AS (
  VALUES
    (-1, 'system_user'),
    (-2, 'foreign_key_check'),
    (-3, 'unsupported_team_schema'),
    (-4, 'migration_0033')
)
SELECT
  'event' AS entity_type,
  event.event_id AS seed_id,
  CASE
    WHEN event.exists_flag = 0 THEN 'ABSENT'
    WHEN event.value_match = 1
      AND event.unmodified = 1
      AND event.gathering_ref = 0
      AND event.notification_ref = 0
      THEN 'DELETE'
    ELSE 'KEEP'
  END AS expected_action,
  rtrim(
    CASE WHEN event.exists_flag = 0
      THEN 'not_found|' ELSE '' END
    || CASE WHEN event.exists_flag = 1 AND event.value_match = 0
      THEN 'values_changed|' ELSE '' END
    || CASE WHEN event.exists_flag = 1 AND event.unmodified = 0
      THEN 'updated_since_seed|' ELSE '' END
    || CASE WHEN event.gathering_ref = 1
      THEN 'gatherings_ref|' ELSE '' END
    || CASE WHEN event.notification_ref = 1
      THEN 'notification_schedules_ref|' ELSE '' END,
    '|'
  ) AS reason_codes
FROM event_state AS event

UNION ALL

SELECT
  'student',
  student.student_id,
  CASE
    WHEN student.exists_flag = 0 THEN 'ABSENT'
    WHEN candidate.student_id IS NOT NULL THEN 'DELETE'
    ELSE 'KEEP'
  END,
  rtrim(
    CASE WHEN student.exists_flag = 0
      THEN 'not_found|' ELSE '' END
    || CASE WHEN student.exists_flag = 1 AND student.value_match = 0
      THEN 'values_changed|' ELSE '' END
    || CASE WHEN student.exists_flag = 1 AND student.unmodified = 0
      THEN 'updated_since_seed|' ELSE '' END
    || CASE WHEN student.exists_flag = 1 AND user.exists_flag = 0
      THEN 'user_missing|' ELSE '' END
    || CASE
      WHEN student.exists_flag = 1
        AND user.exists_flag = 1
        AND (user.value_match = 0 OR user.unmodified = 0)
      THEN 'user_changed|'
      ELSE ''
    END
    || CASE WHEN student.exists_flag = 1 AND room.exists_flag = 0
      THEN 'class_room_missing|' ELSE '' END
    || CASE
      WHEN student.exists_flag = 1
        AND room.exists_flag = 1
        AND room.value_match = 0
      THEN 'class_room_values_changed|'
      ELSE ''
    END
    || CASE
      WHEN student.exists_flag = 1
        AND room.exists_flag = 1
        AND room.unmodified = 0
      THEN 'class_room_updated|'
      ELSE ''
    END
    || CASE WHEN room.teacher_ref = 1
      THEN 'class_room_teacher_ref|' ELSE '' END
    || CASE WHEN user.microsoft_ref = 1
      THEN 'microsoft_account_links_ref|' ELSE '' END
    || CASE WHEN user.firebase_ref = 1
      THEN 'firebase_tokens_ref|' ELSE '' END
    || CASE WHEN user.staff_ref = 1
      THEN 'staffs_ref|' ELSE '' END
    || CASE WHEN user.teacher_ref = 1
      THEN 'teachers_ref|' ELSE '' END
    || CASE WHEN user.gathering_member_ref = 1
      THEN 'gathering_group_members_ref|' ELSE '' END
    || CASE WHEN user.notification_creator_ref = 1
      THEN 'notification_schedules_creator_ref|' ELSE '' END,
    '|'
  )
FROM student_state AS student
INNER JOIN user_state AS user ON user.user_id = student.user_id
INNER JOIN room_state AS room
  ON room.class_room_id = student.class_room_id
LEFT JOIN student_delete_candidates AS candidate
  ON candidate.student_id = student.student_id

UNION ALL

SELECT
  'user',
  user.user_id,
  CASE
    WHEN user.exists_flag = 0 THEN 'ABSENT'
    WHEN candidate.user_id IS NOT NULL THEN 'DELETE'
    ELSE 'KEEP'
  END,
  rtrim(
    CASE WHEN user.exists_flag = 0
      THEN 'not_found|' ELSE '' END
    || CASE WHEN user.exists_flag = 1 AND user.value_match = 0
      THEN 'values_changed|' ELSE '' END
    || CASE WHEN user.exists_flag = 1 AND user.unmodified = 0
      THEN 'updated_since_seed|' ELSE '' END
    || CASE WHEN user.microsoft_ref = 1
      THEN 'microsoft_account_links_ref|' ELSE '' END
    || CASE WHEN user.firebase_ref = 1
      THEN 'firebase_tokens_ref|' ELSE '' END
    || CASE WHEN user.staff_ref = 1
      THEN 'staffs_ref|' ELSE '' END
    || CASE WHEN user.teacher_ref = 1
      THEN 'teachers_ref|' ELSE '' END
    || CASE WHEN user.gathering_member_ref = 1
      THEN 'gathering_group_members_ref|' ELSE '' END
    || CASE WHEN user.notification_creator_ref = 1
      THEN 'notification_schedules_creator_ref|' ELSE '' END
    || CASE
      WHEN user.exists_flag = 1 AND EXISTS (
        SELECT 1
        FROM students AS linked_student
        WHERE linked_student.user_id = user.user_id
          AND NOT EXISTS (
            SELECT 1
            FROM student_delete_candidates AS student_candidate
            WHERE student_candidate.student_id = linked_student.student_id
          )
      )
      THEN 'students_ref_not_deleted|'
      ELSE ''
    END,
    '|'
  )
FROM user_state AS user
LEFT JOIN user_delete_candidates AS candidate
  ON candidate.user_id = user.user_id

UNION ALL

SELECT
  'class_room',
  room.class_room_id,
  CASE
    WHEN room.exists_flag = 0 THEN 'ABSENT'
    WHEN candidate.class_room_id IS NOT NULL THEN 'DELETE'
    ELSE 'KEEP'
  END,
  rtrim(
    CASE WHEN room.exists_flag = 0
      THEN 'not_found|' ELSE '' END
    || CASE WHEN room.exists_flag = 1 AND room.value_match = 0
      THEN 'values_changed|' ELSE '' END
    || CASE WHEN room.exists_flag = 1 AND room.unmodified = 0
      THEN 'updated_since_seed|' ELSE '' END
    || CASE WHEN room.teacher_ref = 1
      THEN 'teacher_ref|' ELSE '' END
    || CASE
      WHEN room.exists_flag = 1 AND EXISTS (
        SELECT 1
        FROM students AS linked_student
        WHERE linked_student.class_room_id = room.class_room_id
          AND NOT EXISTS (
            SELECT 1
            FROM student_delete_candidates AS student_candidate
            WHERE student_candidate.student_id = linked_student.student_id
          )
      )
      THEN 'students_ref_not_deleted|'
      ELSE ''
    END,
    '|'
  )
FROM room_state AS room
LEFT JOIN room_delete_candidates AS candidate
  ON candidate.class_room_id = room.class_room_id

UNION ALL

SELECT
  'check',
  checks.check_id,
  CASE
    WHEN checks.check_name = 'system_user'
      AND check_state.system_user_ok = 1
      THEN 'OK'
    WHEN checks.check_name = 'foreign_key_check'
      AND check_state.foreign_keys_ok = 1
      THEN 'OK'
    WHEN checks.check_name = 'unsupported_team_schema'
      AND check_state.supported_schema = 1
      THEN 'OK'
    WHEN checks.check_name = 'migration_0033'
      AND check_state.migration_applied = 1
      THEN 'APPLIED'
    WHEN checks.check_name = 'migration_0033'
      AND check_state.migration_applied = 0
      THEN 'PENDING'
    ELSE 'NG'
  END,
  checks.check_name
FROM checks
CROSS JOIN check_state

ORDER BY entity_type, seed_id;
