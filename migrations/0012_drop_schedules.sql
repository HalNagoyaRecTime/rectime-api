-- 理想スキーマに存在しないスケジュール機能を廃止する。
-- 0008/0009は既存環境の適用履歴として保持し、本migrationでテーブルを削除する。
DROP TABLE IF EXISTS m_schedules;
