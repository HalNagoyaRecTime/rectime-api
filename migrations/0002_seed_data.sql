-- 学生データ
INSERT INTO m_students (f_student_num, f_class, f_number, f_name, f_note) VALUES
  ('24A001', '1A', '1', '田中太郎',  NULL),
  ('24A002', '1A', '2', '佐藤花子',  NULL),
  ('24B001', '1B', '1', '鈴木一郎',  NULL),
  ('24B002', '1B', '2', '高橋美咲',  NULL),
  ('25A001', '2A', '1', '山田健太',  NULL);

-- イベントデータ
INSERT INTO t_events (f_event_code, f_event_name, f_time, f_duration, f_place, f_gather_time, f_summary) VALUES
  ('REC001', 'バスケットボール大会',   '1100', '120', '体育館',   '1050', '3on3バスケットボールトーナメント'),
  ('REC002', '文化祭準備',             '1400', '120', '第1教室',  '1350', '来月の文化祭に向けた展示物準備'),
  ('REC003', '英語スピーチコンテスト', '1630', '90',  '講堂',     '1620', '学年対抗英語プレゼンテーション大会'),
  ('REC004', 'プログラミング勉強会',   '1900', '120', 'PC教室',   '1850', 'React/TypeScript実践セッション');

-- エントリーデータ
INSERT INTO t_entries (f_student_id, f_event_id) VALUES
  (1, 1),
  (2, 1),
  (3, 2),
  (4, 2),
  (5, 3),
  (1, 3);
