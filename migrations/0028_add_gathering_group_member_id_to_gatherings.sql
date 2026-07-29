ALTER TABLE gatherings
  ADD COLUMN gathering_group_member_id INTEGER
    REFERENCES gathering_group_members(gathering_group_member_id);

CREATE UNIQUE INDEX uq_gatherings_gathering_group_member_id
  ON gatherings(gathering_group_member_id);
