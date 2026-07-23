export interface StudentDTO {
  student_id: number;
  user_name: string;
  class_room_id: number;
  attendance_number: number;
  student_id_number: string;
}

export interface CreateStudentInput {
  class_room_id: number;
  user_name: string;
  attendance_number: number;
  student_id_number: string;
}

export interface BulkImportStudentRow {
  class_code: string;
  attendance_number: number;
  student_id_number: string;
  last_name: string;
  first_name: string;
}

export interface BulkImportStudentsInput {
  rows: BulkImportStudentRow[];
}

export type BulkImportSkipReason =
  | 'student_id_number_duplicate_in_file'
  | 'student_id_number_duplicate_in_db';

export interface BulkImportSkippedRow {
  row_index: number;
  class_code: string;
  attendance_number: number;
  student_id_number: string;
  user_name: string;
  reason: BulkImportSkipReason;
}

export interface BulkImportStudentsResult {
  imported: number;
  skipped: BulkImportSkippedRow[];
}
