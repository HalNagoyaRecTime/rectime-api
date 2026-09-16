export interface StudentDTO {
  student_id: number;
  user_id: number;
  display_name: string;
  class_room_id: number;
  class_room_name: string;
  attendance_number: number;
  student_id_number: string;
  is_live_active: boolean;
}

export interface StudentManagementDTO {
  student_id: number;
  user_id: number;
  display_name: string;
  student_id_number: string;
  attendance_number: number;
  is_live_active: boolean;
  is_staff: boolean;
  class_room: {
    class_room_id: number;
    class_code: string;
    class_name: string;
  };
}

export interface StudentWriteDTO {
  display_name: string;
  class_room_id: number;
  attendance_number: number;
  student_id_number: string;
}

export interface StudentPageDTO {
  items: StudentManagementDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface StudentImportRow {
  class_code: string;
  attendance_number: number;
  student_id_number: string;
  last_name: string;
  first_name: string;
}

export interface StudentImportInput {
  rows: StudentImportRow[];
}

export type StudentImportErrorReason =
  | 'student_id_number_duplicate_in_file'
  | 'student_id_number_duplicate_in_db';

export interface StudentImportRowError {
  row_index: number;
  class_code: string;
  attendance_number: number;
  student_id_number: string;
  display_name: string;
  reason: StudentImportErrorReason;
}

export interface StudentImportValidationResult {
  total: number;
  success_count: number;
  error_count: number;
  errors: StudentImportRowError[];
}

export interface StudentImportCommitResult {
  total: number;
  imported: number;
  error_count: number;
  errors: StudentImportRowError[];
}
