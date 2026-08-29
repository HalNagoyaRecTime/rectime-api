-- 集合グループはIDだけで識別するため、名称カラムを削除する。
-- 親テーブル自体は再作成せず、gathering_group_membersやgatheringsが
-- 保持している外部キー参照と既存データをそのまま維持する。
ALTER TABLE gathering_groups DROP COLUMN gathering_group_name;
