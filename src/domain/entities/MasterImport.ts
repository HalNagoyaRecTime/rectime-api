export type MasterImportType = 'students' | 'classrooms' | 'teachers';
export type MasterImportStatus = 'validated' | 'committed';

export const MASTER_IMPORT_EXCLUSION_REASONS = [
  'student_already_registered',
  'student_already_registered_inactive',
] as const;

export type MasterImportExclusionReason =
  (typeof MASTER_IMPORT_EXCLUSION_REASONS)[number];

export interface MasterImportExcludedRow {
  row_index: number;
  class_code: string;
  attendance_number: number;
  student_id_number: string;
  display_name: string;
  student_id: number;
  user_id: number;
  reason: MasterImportExclusionReason;
}

export interface MasterImportCommittedResult {
  imported: number;
  error_count: number;
  errors: unknown[];
}

export interface MasterImportSession {
  validated_file_id: string;
  create_user_id: number;
  type: MasterImportType;
  status: MasterImportStatus;
  file_name: string;
  total: number;
  success_count: number;
  error_count: number;
  errors: unknown[];
  excluded_count: number;
  excluded: MasterImportExcludedRow[];
  rows: unknown[];
  created_at: string;
  updated_at?: string;
  committed_result: MasterImportCommittedResult | null;
}

// セッション本体が期限切れで消えた後も残す、存在確認用の最小情報
export interface MasterImportTombstone {
  created_at: string;
  create_user_id: number;
}
