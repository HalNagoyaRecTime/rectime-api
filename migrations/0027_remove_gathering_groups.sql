-- gathering_groups を介した1対1の関係を廃止し、集合メンバーを
-- gatherings.gathering_id へ直接紐づける。
--
-- gathering_group_members だけが存在し、対応する gatherings がない場合は
-- gathering_id を決められない。データを黙って失わないよう、移行を中断する。
CREATE TABLE __migration_0027_guard (
  unmatched_member_count INTEGER NOT NULL
    CHECK (unmatched_member_count = 0)
);

INSERT INTO __migration_0027_guard (unmatched_member_count)
SELECT COUNT(*)
FROM gathering_group_members AS member
LEFT JOIN gatherings AS gathering
  ON gathering.gathering_group_id = member.gathering_group_id
WHERE gathering.gathering_id IS NULL;

DROP TABLE __migration_0027_guard;

-- 既存データが削除済みでも、AUTOINCREMENTが一度払い出したIDを再利用しないよう
-- 旧テーブルの高水位を退避する。
CREATE TABLE __migration_0027_sequences (
  gatherings_seq INTEGER NOT NULL,
  gathering_group_members_seq INTEGER NOT NULL
);

INSERT INTO __migration_0027_sequences (
  gatherings_seq,
  gathering_group_members_seq
)
SELECT
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'gatherings'),
    0
  ),
  COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'gathering_group_members'),
    0
  );

-- 旧テーブルを一時名へ変更し、最終名のテーブルを直接作成する。
-- 子テーブルの外部キーをテーブル名のrenameへ依存させないことで、
-- legacy_alter_tableの設定にかかわらずgatheringsを参照できるようにする。
ALTER TABLE gathering_group_members
  RENAME TO gathering_group_members_legacy;
ALTER TABLE gatherings RENAME TO gatherings_legacy;

CREATE TABLE gatherings (
  gathering_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  gathering_spot_id INTEGER NOT NULL REFERENCES gathering_spots(gathering_spot_id),
  gathering_time TEXT NOT NULL DEFAULT '99:59',
  round INTEGER NOT NULL DEFAULT 99,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gatherings (
  gathering_id,
  event_id,
  gathering_spot_id,
  gathering_time,
  round,
  created_at,
  updated_at
)
SELECT
  gathering_id,
  event_id,
  gathering_spot_id,
  gathering_time,
  round,
  created_at,
  updated_at
FROM gatherings_legacy;

CREATE TABLE gathering_group_members (
  gathering_group_member_id INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering_id INTEGER NOT NULL REFERENCES gatherings(gathering_id),
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gathering_group_members (
  gathering_group_member_id,
  gathering_id,
  user_id,
  created_at,
  updated_at
)
SELECT
  member.gathering_group_member_id,
  gathering.gathering_id,
  member.user_id,
  member.created_at,
  member.updated_at
FROM gathering_group_members_legacy AS member
INNER JOIN gatherings_legacy AS gathering
  ON gathering.gathering_group_id = member.gathering_group_id;

-- 外部キーの子から順に旧テーブルを削除する。
DROP TABLE gathering_group_members_legacy;
DROP TABLE gatherings_legacy;
DROP TABLE gathering_groups;

-- 現存する最大IDと旧AUTOINCREMENT高水位の大きい方を維持する。
UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (SELECT gatherings_seq FROM __migration_0027_sequences)
)
WHERE name = 'gatherings';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'gatherings', gatherings_seq
FROM __migration_0027_sequences
WHERE gatherings_seq > 0
  AND NOT EXISTS (
    SELECT 1 FROM sqlite_sequence WHERE name = 'gatherings'
  );

UPDATE sqlite_sequence
SET seq = MAX(
  seq,
  (
    SELECT gathering_group_members_seq
    FROM __migration_0027_sequences
  )
)
WHERE name = 'gathering_group_members';

INSERT INTO sqlite_sequence (name, seq)
SELECT 'gathering_group_members', gathering_group_members_seq
FROM __migration_0027_sequences
WHERE gathering_group_members_seq > 0
  AND NOT EXISTS (
    SELECT 1
    FROM sqlite_sequence
    WHERE name = 'gathering_group_members'
  );

DROP TABLE __migration_0027_sequences;

CREATE INDEX idx_gatherings_event_id
  ON gatherings(event_id);
CREATE INDEX idx_gatherings_spot_id
  ON gatherings(gathering_spot_id);
CREATE INDEX idx_gathering_group_members_user_id
  ON gathering_group_members(user_id);
CREATE UNIQUE INDEX uq_gathering_group_members_gathering_user
  ON gathering_group_members(gathering_id, user_id);
