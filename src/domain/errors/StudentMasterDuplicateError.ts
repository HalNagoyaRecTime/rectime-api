export type StudentMasterDuplicateReason =
  | 'student_id_number_duplicate_in_file'
  | 'student_id_number_duplicate_in_db'
  | 'class_attendance_duplicate_in_file'
  | 'class_attendance_duplicate_in_db';

export interface StudentMasterDuplicate {
  rowIndex: number;
  classCode: number;
  attendanceNumber: number;
  studentIdNumber: number;
  userName: string;
  reasons: StudentMasterDuplicateReason[];
}

export class StudentMasterDuplicateError extends Error {
  constructor(public readonly duplicates: StudentMasterDuplicate[]) {
    super(`Duplicate student master rows: ${duplicates.length}`);
    this.name = 'StudentMasterDuplicateError';
  }
}
