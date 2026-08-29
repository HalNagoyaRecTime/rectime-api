import type { ClassRoomTeacher } from '../../domain/entities/ClassRoom';

export interface ClassRoomDTO {
  class_room_id: number;
  class_code: string;
  class_name: string;
  student_count: number;
  teacher: ClassRoomTeacher | null;
  team_id: number | null;
}

export interface ClassRoomPageDTO {
  classrooms: ClassRoomDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClassRoomRequestDTO {
  class_code: string;
  class_name: string;
  teacher_id: number | null;
  team_id?: number | null;
}

export interface ClassRoomImportRow {
  class_code: string;
  class_name: string;
}

export interface ClassRoomImportInput {
  rows: ClassRoomImportRow[];
}

export type ClassRoomImportErrorReason =
  | 'class_code_duplicate_in_file'
  | 'class_code_duplicate_in_db';

export interface ClassRoomImportRowError {
  row_index: number;
  class_code: string;
  class_name: string;
  reason: ClassRoomImportErrorReason;
}

export interface ClassRoomImportValidationResult {
  total: number;
  success_count: number;
  error_count: number;
  errors: ClassRoomImportRowError[];
}

export interface ClassRoomImportCommitResult {
  total: number;
  imported: number;
  error_count: number;
  errors: ClassRoomImportRowError[];
}
