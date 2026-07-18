export interface StudentDTO {
  student_id: number;
  user_name: string;
  class_room_id: number;
  attendance_number: number;
  student_id_number: string;
}

export interface CreateStudentInput {
  class_room_id: number;
  user_name: string;
  attendance_number: number;
  student_id_number: string;
}
