-- ラウンドと同様に集合行へ開始時刻を持たせる。既存行は未設定のまま維持する。
ALTER TABLE gatherings ADD COLUMN round_start_time TEXT
  CHECK (round_start_time IS NULL OR (
    length(round_start_time) = 4
    AND round_start_time GLOB '[0-2][0-9][0-5][0-9]'
    AND substr(round_start_time, 1, 2) <= '23'
  ));
