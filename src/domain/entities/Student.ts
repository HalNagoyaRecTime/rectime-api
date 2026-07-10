export interface StudentEntity {
  f_users_id: number;
  f_class_room_id: number;
  f_user_name: string;
  f_uid: string;
  f_student_id: number;
  f_attendance_number: number;
  f_student_id_number: string;
}

export interface NewStudentInput {
  classRoomId: number;
  userName: string;
  uid: string;
  attendanceNumber: number;
  studentIdNumber: string;
}
