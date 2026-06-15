export interface StudentEntity {
  f_users_id: number;
  f_class_room_id: number;
  f_display_name: string;
  f_uid: string;
  f_student_id: number;
  f_attendance_number: number;
  f_student_id_number: string;
}

export interface StudentDTO {
  student_id: number;
  display_name: string;
  class_room_id: number;
  uid: string;
  attendance_number: number;
  student_id_number: string;
}
