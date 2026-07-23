export interface TeacherDTO {
  teacher_id: number;
  display_name: string;
}

export interface TeacherImportRow {
  last_name: string;
  first_name: string;
}

export interface TeacherImportInput {
  rows: TeacherImportRow[];
}

export interface TeacherImportRowError {
  row_index: number;
  last_name: string;
  first_name: string;
  reason: string;
}

export interface TeacherImportValidationResult {
  total: number;
  success_count: number;
  error_count: number;
  errors: TeacherImportRowError[];
}

export interface TeacherImportCommitResult {
  total: number;
  imported: number;
  error_count: number;
  errors: TeacherImportRowError[];
}
