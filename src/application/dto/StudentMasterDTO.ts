export interface StudentMasterRowInput {
  class_code: number;
  attendance_number: number;
  student_id_number: number;
  user_name: string;
}

export interface ImportStudentMasterInput {
  rows: StudentMasterRowInput[];
}

export interface ImportStudentMasterResult {
  imported: number;
}
