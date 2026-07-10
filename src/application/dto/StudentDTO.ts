export interface StudentDTO {
  student_id: number;
  display_name: string;
  class_room_id: number;
  uid: string;
  attendance_number: number;
  student_id_number: string;
}

export interface CreateStudentInput {
  class_room_id: number;
  user_name: string;
  uid: string;
  attendance_number: number;
  student_id_number: string;
}
