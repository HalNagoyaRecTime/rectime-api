-- 通知作成時点の対象条件を、LegacyのToken単位Scheduleとは別に保存する。
-- Phase 1では配信経路の切替や既存データの移行は行わない。
CREATE TABLE notification_audiences (
  notification_audience_id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL
    REFERENCES notifications(notification_id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (
    audience_type IN (
      'all',
      'class_room',
      'gathering',
      'event_participants',
      'user',
      'users'
    )
  ),
  class_room_id INTEGER REFERENCES class_rooms(class_room_id),
  gathering_id INTEGER REFERENCES gatherings(gathering_id),
  event_id INTEGER REFERENCES events(event_id),
  user_id INTEGER REFERENCES users(user_id),
  -- usersの対象User一覧はJSON配列で保存する。
  user_ids TEXT CHECK (user_ids IS NULL OR json_valid(user_ids)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (audience_type = 'all'
      AND class_room_id IS NULL
      AND gathering_id IS NULL
      AND event_id IS NULL
      AND user_id IS NULL
      AND user_ids IS NULL)
    OR (audience_type = 'class_room'
      AND class_room_id IS NOT NULL
      AND gathering_id IS NULL
      AND event_id IS NULL
      AND user_id IS NULL
      AND user_ids IS NULL)
    OR (audience_type = 'gathering'
      AND class_room_id IS NULL
      AND gathering_id IS NOT NULL
      AND event_id IS NULL
      AND user_id IS NULL
      AND user_ids IS NULL)
    OR (audience_type = 'event_participants'
      AND class_room_id IS NULL
      AND gathering_id IS NULL
      AND event_id IS NOT NULL
      AND user_id IS NULL
      AND user_ids IS NULL)
    OR (audience_type = 'user'
      AND class_room_id IS NULL
      AND gathering_id IS NULL
      AND event_id IS NULL
      AND user_id IS NOT NULL
      AND user_ids IS NULL)
    OR (audience_type = 'users'
      AND class_room_id IS NULL
      AND gathering_id IS NULL
      AND event_id IS NULL
      AND user_id IS NULL
      AND user_ids IS NOT NULL)
  )
);

CREATE INDEX idx_notification_audiences_notification_id
  ON notification_audiences(notification_id);
CREATE INDEX idx_notification_audiences_type
  ON notification_audiences(audience_type);
