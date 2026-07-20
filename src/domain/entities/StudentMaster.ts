export interface StudentMasterEntity {
  student_master: number;
  class_code: number;
  attendance_number: number;
  student_id_number: number;
  user_name: string;
  created_at: string;
}

export interface NewStudentMasterRow {
  classCode: number;
  attendanceNumber: number;
  studentIdNumber: number;
  userName: string;
}
