-- notifications テーブルへのローカルテスト用データ投入
-- notification_id は AUTOINCREMENT のため INSERT では指定しない
--
-- events テーブル(event_id: 1〜4)の内容に合わせた通知データ
--   1: バスケットボール大会(体育館 / 11:00〜13:00)
--   2: 文化祭準備(第1教室 / 14:00〜16:00)
--   3: 英語スピーチコンテスト(講堂 / 16:30〜18:00)
--   4: プログラミング勉強会(PC教室 / 19:00〜21:00)
--
-- notification_type: schedule_change(予定変更) / gathering_reminder(集合リマインド) / forgotten_item(忘れ物)

INSERT INTO notifications (notification_type, title, body, created_at, updated_at) VALUES
  ('gathering_reminder', 'バスケットボール大会 集合のお知らせ', '本日11:00より体育館にて3on3バスケットボールトーナメントを開催します。開始15分前までに集合してください。', '2026-07-20T09:00:00Z', '2026-07-20T09:00:00Z'),
  ('schedule_change', 'バスケットボール大会 開始時刻変更', '体育館の都合により、バスケットボール大会の開始時刻が11:00から11:30に変更となりました。', '2026-07-21T10:30:00Z', '2026-07-21T10:30:00Z'),
  ('gathering_reminder', '文化祭準備 集合のお知らせ', '来月の文化祭に向けた展示物準備を第1教室にて14:00〜16:00で行います。参加者は14:00までに教室にお越しください。', '2026-07-22T08:00:00Z', '2026-07-22T08:00:00Z'),
  ('schedule_change', '英語スピーチコンテスト 開始時刻変更', '学年対抗英語プレゼンテーション大会は、講堂の都合により開始時刻が16:30から17:00に変更となりました。', '2026-07-23T18:00:00Z', '2026-07-23T18:00:00Z'),
  ('schedule_change', 'プログラミング勉強会 会場変更のお知らせ', 'React/TypeScript実践セッションの会場をPC教室から第2PC教室に変更しました。開始時刻(19:00)に変更はありません。', '2026-07-24T12:00:00Z', '2026-07-24T15:00:00Z'),
  ('forgotten_item', '体育館での忘れ物のお知らせ', 'バスケットボール大会終了後、体育館にて忘れ物(タオル・水筒など)が複数見つかっています。お心当たりの方は職員室までお越しください。', '2026-07-25T07:15:00Z', '2026-07-25T07:15:00Z');

  -- firebase_tokens テーブルへのローカルテスト用データ投入
-- firebase_token_id は notifications と同様 AUTOINCREMENT 想定のため INSERT では指定しない
-- user_id は users テーブルの既存データ(1〜5)を参照
-- platform: 1 = ios, 2 = android

INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active, last_seen_at, created_at, updated_at) VALUES
  (1, 1, 'fcm_test_token_user1_ios_0001', 1, '2026-07-25T09:00:00Z', '2026-07-16T12:22:58Z', '2026-07-25T09:00:00Z'),
  (2, 2, 'fcm_test_token_user2_android_0002', 1, '2026-07-25T08:45:00Z', '2026-07-16T12:22:58Z', '2026-07-25T08:45:00Z'),
  (3, 1, 'fcm_test_token_user3_ios_0003', 1, '2026-07-24T21:10:00Z', '2026-07-16T12:22:58Z', '2026-07-24T21:10:00Z'),
  (4, 2, 'fcm_test_token_user4_android_0004', 1, '2026-07-23T15:30:00Z', '2026-07-16T12:22:58Z', '2026-07-23T15:30:00Z'),
  (5, 1, 'fcm_test_token_user5_ios_0005', 0, '2026-07-10T11:00:00Z', '2026-07-16T12:22:58Z', '2026-07-20T18:00:00Z');

-- notification_schedules テーブルへのローカルテスト用データ投入
-- notification_schedule_id は AUTOINCREMENT 想定のため INSERT では指定しない
--
-- 参照元:
--   created_user_id   -> users (user_id: 1〜5)
--   event_id          -> events (event_id: 1〜4)
--   notification_id   -> 0002_seed_notifications.sql で投入した notifications (1〜6)
--   firebase_token_id -> 0003_seed_firebase_tokens.sql で投入した firebase_tokens (1〜5)
--
-- send_status: draft/sending/sent/failed
-- importance: 1:最大 2:高 3:中 4:低

INSERT INTO notification_schedules (
  created_user_id, event_id, notification_id, firebase_token_id,
  send_status, fcm_message_id, failed_reason, send_at, importance,
  created_at, updated_at
) VALUES
  -- ドッジボール大会(notification_id:1) -> バスケットボール大会(event_id:1)
  (1, 1, 1, 1, 'sent', 'fcm_msg_0001', NULL, '2026-07-28T09:00:00Z', 2, '2026-07-20T09:00:00Z', '2026-07-28T09:05:00Z'),

  -- 玉入れ大会 日程変更(notification_id:2) -> バスケットボール大会(event_id:1)
  (2, 1, 2, 2, 'sent', 'fcm_msg_0002', NULL, '2026-07-31T08:30:00Z', 1, '2026-07-21T10:30:00Z', '2026-07-31T08:35:00Z'),

  -- 綱引き大会 参加者募集(notification_id:3) -> 文化祭準備(event_id:2)
  (3, 2, 3, 3, 'sending', NULL, NULL, '2026-08-04T13:00:00Z', 3, '2026-07-22T08:00:00Z', '2026-07-22T08:00:00Z'),

  -- リレー大会 集合時間のリマインド(notification_id:4) -> 英語スピーチコンテスト(event_id:3)
  (4, 3, 4, 4, 'draft', NULL, NULL, '2026-08-08T15:30:00Z', 2, '2026-07-23T18:00:00Z', '2026-07-23T18:00:00Z'),

  -- 大縄跳び大会 会場変更(notification_id:5) -> プログラミング勉強会(event_id:4)
  (5, 4, 5, 5, 'failed', NULL, 'FCMトークンが無効です(is_firebase_active=0)', '2026-07-25T18:00:00Z', 2, '2026-07-24T12:00:00Z', '2026-07-25T18:01:00Z'),

  -- フットサル大会 開始時刻変更(notification_id:6) -> バスケットボール大会(event_id:1)
  (1, 1, 6, 1, 'draft', NULL, NULL, '2026-08-09T13:30:00Z', 4, '2026-07-25T07:15:00Z', '2026-07-25T07:15:00Z');
