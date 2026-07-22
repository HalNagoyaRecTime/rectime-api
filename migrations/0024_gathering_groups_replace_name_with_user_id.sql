-- gathering_groups.gathering_group_name を廃止し、グループのオーナーを表す
-- user_id (NOT NULL UNIQUE, FK users) に置き換える。
-- 既存データの user_id は「そのグループに最初に参加したメンバー」を
-- オーナーとみなして補完する。

-- オーナーを特定できないグループ（メンバーが1人もいない）が存在する場合は
-- 補完方法が定まらないため、原因を特定しやすいよう即座に中断する。
CREATE TABLE __migration_0024_guard_no_owner (
  no_owner_count INTEGER CHECK (no_owner_count = 0)
);
INSERT INTO __migration_0024_guard_no_owner (no_owner_count)
SELECT COUNT(*)
FROM gathering_groups g
WHERE NOT EXISTS (
  SELECT 1 FROM gathering_group_members m
  WHERE m.gathering_group_id = g.gathering_group_id
);
DROP TABLE __migration_0024_guard_no_owner;

-- 1ユーザーが複数グループの「最初のメンバー」になっている場合、
-- user_id の UNIQUE 制約に違反するため同様に中断する。
CREATE TABLE __migration_0024_guard_dup_owner (
  dup_owner_count INTEGER CHECK (dup_owner_count = 0)
);
INSERT INTO __migration_0024_guard_dup_owner (dup_owner_count)
SELECT COUNT(*) FROM (
  SELECT owner_user_id
  FROM (
    SELECT
      g.gathering_group_id,
      (
        SELECT m.user_id
        FROM gathering_group_members m
        WHERE m.gathering_group_id = g.gathering_group_id
        ORDER BY m.gathering_group_member_id
        LIMIT 1
      ) AS owner_user_id
    FROM gathering_groups g
  )
  GROUP BY owner_user_id
  HAVING COUNT(*) > 1
);
DROP TABLE __migration_0024_guard_dup_owner;

-- gatherings/gathering_group_members/notification_schedules が
-- gathering_groups を外部キー参照している。通常のRENAMEではSQLiteが
-- それらのREFERENCES句を自動的に新しいテーブル名へ書き換えてしまうため、
-- 参照される側（gathering_groups）は一度もRENAMEしない。
-- 代わりに新テーブルを別名で作成しデータを移し、旧テーブルをDROPしてから
-- 新テーブルを本来の名前へRENAMEすることで、他テーブルのREFERENCES句が
-- 常に "gathering_groups" を指したまま（DROP直後は宙に浮くがRENAMEで再び
-- 解決する）で済むようにする。
CREATE TABLE gathering_groups_new (
  gathering_group_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gathering_groups_new (gathering_group_id, user_id, created_at, updated_at)
SELECT
  g.gathering_group_id,
  (
    SELECT m.user_id
    FROM gathering_group_members m
    WHERE m.gathering_group_id = g.gathering_group_id
    ORDER BY m.gathering_group_member_id
    LIMIT 1
  ),
  g.created_at,
  g.updated_at
FROM gathering_groups g;

DROP TABLE gathering_groups;
ALTER TABLE gathering_groups_new RENAME TO gathering_groups;
