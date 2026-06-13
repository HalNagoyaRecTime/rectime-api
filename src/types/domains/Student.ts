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
  f_student_id: string;
  f_student_num: string;
  f_class: string;
  f_number: string;
  f_name: string;
  f_note?: string;
}
