-- クラスルームデータ
INSERT INTO m_class_rooms (f_class_code, f_name) VALUES
  ('11A', '1年Aクラス'),
  ('11B', '1年Bクラス'),
  ('12A', '2年Aクラス');

-- ユーザーデータ
INSERT INTO m_users (f_class_room_id, f_display_name, f_uid) VALUES
  (1, '田中太郎', '0000-0000'),
  (1, '佐藤花子', '0000-0001'),
  (2, '鈴木一郎', '0000-0002'),
  (2, '高橋美咲', '0000-0003'),
  (3, '山田健太', '0000-0004');

-- イベントデータ
INSERT INTO t_events (f_event_code, f_event_name, f_time, f_duration, f_place, f_gather_time, f_summary) VALUES
  ('REC001', 'バスケットボール大会',   '1100', '120', '体育館',   '1050', '3on3バスケットボールトーナメント'),
  ('REC002', '文化祭準備',             '1400', '120', '第1教室',  '1350', '来月の文化祭に向けた展示物準備'),
  ('REC003', '英語スピーチコンテスト', '1630', '90',  '講堂',     '1620', '学年対抗英語プレゼンテーション大会'),
  ('REC004', 'プログラミング勉強会',   '1900', '120', 'PC教室',   '1850', 'React/TypeScript実践セッション');

-- 学生詳細
INSERT INTO m_student_description (f_users_id, f_attendance_number, f_student_id_number) VALUES
  (1, 1, '10000'),
  (2, 2, '10001'),
  (3, 3, '10002'),
  (4, 4, '10003'); -- 5番目の人は先生のつもりです。
