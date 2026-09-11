export interface TeacherClassRoomDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
}

export interface TeacherDTO {
  teacher_id: number;
  user_id: number;
  display_name: string;
  email: string;
  is_live_active: boolean;
  is_staff: boolean;
  class_rooms: TeacherClassRoomDTO[];
}

export interface TeacherPageDTO {
  items: TeacherDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface TeacherImportRow {
  last_name: string;
  first_name: string;
  email: string;
}

export type TeacherImportErrorReason =
  | 'email_duplicate_in_file'
  | 'email_duplicate_in_db';

export interface TeacherImportInput {
  rows: TeacherImportRow[];
}

export interface TeacherImportRowError {
  row_index: number;
  last_name: string;
  first_name: string;
  email: string;
  reason: TeacherImportErrorReason;
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
