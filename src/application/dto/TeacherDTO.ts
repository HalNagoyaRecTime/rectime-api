export interface TeacherClassRoomDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
}

export interface TeacherDTO {
  teacher_id: number;
  user_id: number;
  display_name: string;
  is_live_active: boolean;
  class_rooms: TeacherClassRoomDTO[];
}

export interface TeacherPageDTO {
  items: TeacherDTO[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
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
